import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { fullName, RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pkAt, pkDdMmYyyy, pkHhmm, pkIsoDate } from '../common/pk-time';
import {
  CaseEventType,
  ParticipantRole,
  ParticipantStatus,
  Prisma,
  SessionCommand,
} from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSlots, ddmmyyyy, isoDate, Slot } from '../scheduling/slots';
import { SettingsService } from '../settings/settings.service';
import { VIDEO_PROVIDER, type VideoProvider } from './video-provider';
import { SessionCommandDto, SessionEventDto } from './virtual-courtroom.dto';

export const LOBBY_LOCKED_MESSAGE = 'Court Session Lobby is currently locked by the Admin Bench.';
export const MODERATION_REQUIRES_JAAS = 'Moderation controls require the JaaS configuration.';
export const SESSION_OPENED_BODY = 'The virtual courtroom for your hearing is open.';
export const EJECTED_MESSAGE =
  'You were moved to the court lobby by the Admin Bench. Please wait to be readmitted.';
const SESSION_ENDED_MESSAGE = 'This virtual hearing session has ended.';

/** The room opens 15 minutes before the slot starts and closes 60 minutes after it ends. */
const OPENS_BEFORE_MIN = 15;
const CLOSES_AFTER_MIN = 60;
/** A participant counts as "Live" when the client reported in within this window (heartbeat every 15 s). */
const LIVE_WINDOW_MS = 45_000;
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export type RoomState = 'LOCKED' | 'OPEN' | 'NOT_YET' | 'CLOSED';

const CONFIRMATION: Record<SessionCommand, string> = {
  MUTE_AUDIO: 'Audio muted',
  DISABLE_VIDEO: 'Video disabled',
  EJECT: 'Moved to lobby',
  READMIT: 'Readmitted',
};

const COMMAND_DONE: Record<SessionCommand, string> = {
  MUTE_AUDIO: 'Audio input muted',
  DISABLE_VIDEO: 'Video broadcast disabled',
  EJECT: 'Participant moved to the lobby',
  READMIT: 'Participant readmitted',
};

const hearingInclude = {
  case: {
    select: {
      id: true,
      ucn: true,
      title: true,
      filedById: true,
      judgeId: true,
      parties: { select: { lawyer: { select: { userId: true } } } },
    },
  },
  courtroom: { select: { name: true } },
  judge: { select: { id: true, firstName: true, lastName: true } },
  session: true,
} satisfies Prisma.HearingInclude;

type RoomHearing = Prisma.HearingGetPayload<{ include: typeof hearingInclude }>;

const participantInclude = {
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CourtSessionParticipantInclude;

type ParticipantRow = Prisma.CourtSessionParticipantGetPayload<{
  include: typeof participantInclude;
}>;

// Every time here is Pakistan time, whatever the server's time zone.
const hhmm = pkHhmm;
const localDdMmYyyy = pkDdMmYyyy;
const localAt = pkAt;
const localToday = () => pkIsoDate();

function randomRoomName(): string {
  let out = '';
  for (let i = 0; i < 24; i++) out += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return out;
}

const participantRoleOf = (role: AuthUser['role']): ParticipantRole =>
  role === 'ADMIN' || role === 'JUDGE' || role === 'LAWYER' || role === 'LITIGANT'
    ? role
    : 'OBSERVER';

/** Status shown in the attendee list, from the client's own audio/video flags. */
const derivedStatus = (audioMuted: boolean, videoOff: boolean): ParticipantStatus =>
  audioMuted ? 'MUTED' : videoOff ? 'VIDEO_OFF' : 'JOINED';

/** UC-4.1, UC-3.3 and UC-4.2: virtual courtroom sessions on Jitsi. */
@Injectable()
export class VirtualCourtroomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
  ) {}

  // ------------------------------------------------------------------ helpers

  private async slots(): Promise<Slot[]> {
    return buildSlots(await this.settings.schedulePolicy());
  }

  private window(h: { date: Date; timeSlot: number; startTime: string | null }, slots: Slot[]) {
    const slot = slots.find((s) => s.slot === h.timeSlot);
    const startTime = h.startTime ?? slot?.start ?? '09:00';
    const start = localAt(h.date, startTime);
    const end = slot ? localAt(h.date, slot.end) : new Date(start.getTime() + 30 * 60_000);
    return {
      startTime,
      endTime: hhmm(end),
      opensAt: new Date(start.getTime() - OPENS_BEFORE_MIN * 60_000),
      closesAt: new Date(end.getTime() + CLOSES_AFTER_MIN * 60_000),
    };
  }

  /** LOCKED, OPEN, NOT_YET or CLOSED for one hearing right now. */
  private evaluate(h: RoomHearing, slots: Slot[], now = new Date()) {
    const w = this.window(h, slots);
    let state: RoomState;
    let message: string;
    if (h.status === 'CANCELLED') {
      state = 'CLOSED';
      message = 'This hearing was cancelled.';
    } else if (
      h.status === 'HELD' ||
      h.status === 'ADJOURNED' ||
      h.session?.status === 'ENDED' ||
      now > w.closesAt
    ) {
      state = 'CLOSED';
      message = SESSION_ENDED_MESSAGE;
    } else if (now < w.opensAt) {
      state = 'NOT_YET';
      message = `The video room opens at ${hhmm(w.opensAt)} on ${localDdMmYyyy(w.opensAt)}, 15 minutes before the hearing.`;
    } else if (h.session?.status !== 'ACTIVE') {
      state = 'LOCKED';
      message = LOBBY_LOCKED_MESSAGE;
    } else {
      state = 'OPEN';
      message = 'The virtual courtroom is open.';
    }
    return {
      state,
      message,
      startTime: w.startTime,
      endTime: w.endTime,
      opensAt: w.opensAt,
      closesAt: w.closesAt,
    };
  }

  private isModerator(user: AuthUser, h: RoomHearing) {
    return user.role === 'ADMIN' || h.judgeId === user.id || h.case.judgeId === user.id;
  }

  /** The filer, the case's lawyers, the case's judge and admins; anyone else (and non-virtual hearings) get 404. */
  private async loadForUser(user: AuthUser, hearingId: string): Promise<RoomHearing> {
    const h = await this.prisma.hearing.findUnique({
      where: { id: hearingId },
      include: hearingInclude,
    });
    if (!h || !h.isVirtual) throw new NotFoundException(Messages.NOT_FOUND);
    const allowed =
      this.isModerator(user, h) ||
      h.case.filedById === user.id ||
      h.case.parties.some((p) => p.lawyer?.userId === user.id);
    if (!allowed) throw new NotFoundException(Messages.NOT_FOUND);
    return h;
  }

  private async audience(h: RoomHearing): Promise<string[]> {
    return [
      ...new Set([
        h.case.filedById,
        h.judgeId,
        ...h.case.parties.flatMap((p) => (p.lawyer ? [p.lawyer.userId] : [])),
      ]),
    ];
  }

  private participantView(p: ParticipantRow, now = new Date()) {
    const live =
      p.status !== 'EJECTED' &&
      !p.leftAt &&
      Boolean(p.lastSeenAt && now.getTime() - p.lastSeenAt.getTime() < LIVE_WINDOW_MS);
    return {
      id: p.id,
      userId: p.userId,
      name: fullName(p.user),
      role: p.role,
      status: p.status,
      audioMuted: p.audioMuted,
      videoOff: p.videoOff,
      providerParticipantId: p.providerParticipantId,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      lastSeenAt: p.lastSeenAt,
      live,
      lastCommand: p.lastCommand,
      lastCommandAt: p.lastCommandAt,
      confirmation: p.lastCommand ? CONFIRMATION[p.lastCommand] : null,
    };
  }

  private hearingSummary(h: RoomHearing, slots: Slot[]) {
    const e = this.evaluate(h, slots);
    return {
      id: h.id,
      caseId: h.case.id,
      ucn: h.case.ucn,
      title: h.case.title,
      date: isoDate(h.date),
      startTime: e.startTime,
      endTime: e.endTime,
      status: h.status,
      courtroom: h.courtroom?.name ?? null,
      judge: fullName(h.judge),
      opensAt: e.opensAt,
      closesAt: e.closesAt,
    };
  }

  private async log(
    actor: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
    meta: RequestMeta,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    await this.audit.logWithin(db, {
      action,
      actorId: actor.id,
      actorRole: actor.role,
      entity,
      entityId,
      metadata,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ------------------------------------------------------------------ admin: UC-4.1

  /** UC-4.1 Initialize Encrypted Court Session. */
  async initialize(actor: AuthUser, hearingId: string, meta: RequestMeta) {
    const h = await this.prisma.hearing.findUnique({
      where: { id: hearingId },
      include: hearingInclude,
    });
    if (!h) throw new NotFoundException(Messages.NOT_FOUND);
    if (!h.isVirtual) {
      throw new ConflictException({
        code: 'NOT_VIRTUAL',
        message: 'This hearing is not flagged as a virtual hearing.',
      });
    }
    if (h.session) {
      throw new ConflictException({
        code: 'SESSION_EXISTS',
        message: 'A virtual courtroom session already exists for this hearing.',
      });
    }
    if (h.status !== 'SCHEDULED') {
      throw new ConflictException({
        code: 'NOT_SCHEDULED',
        message: 'Only scheduled hearings can be opened in the virtual courtroom.',
      });
    }
    if (isoDate(h.date) !== localToday()) {
      throw new ConflictException({
        code: 'NOT_TODAY',
        message: 'A virtual courtroom session can only be initialized on the day of the hearing.',
      });
    }
    const slots = await this.slots();
    const w = this.window(h, slots);
    if (new Date() > w.closesAt) {
      throw new ConflictException({
        code: 'WINDOW_PASSED',
        message: 'The time window for this hearing has passed.',
      });
    }

    const when = `${ddmmyyyy(h.date)} at ${w.startTime}`;
    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.courtSession.create({
          data: {
            hearingId: h.id,
            roomName: randomRoomName(),
            status: 'ACTIVE',
            provider: this.provider.kind,
            initializedById: actor.id,
            startedAt: new Date(),
          },
        });
        await tx.caseEvent.create({
          data: {
            caseId: h.case.id,
            type: CaseEventType.SESSION_INITIALIZED,
            description: `Virtual courtroom session opened for the hearing on ${when}.`,
            actorId: actor.id,
          },
        });
        await this.log(
          actor,
          AuditAction.VIRTUAL_SESSION_INITIALIZED,
          'CourtSession',
          created.id,
          { hearingId: h.id, ucn: h.case.ucn, provider: this.provider.kind },
          meta,
          tx,
        );
        await this.notifications.notifyMany(
          await this.audience(h),
          {
            type: 'HEARING_VIRTUAL_SESSION_OPENED',
            title: 'Virtual courtroom open',
            body: `${SESSION_OPENED_BODY} ${h.case.ucn}, hearing on ${when}.`,
          },
          tx,
        );
        return created;
      });
      return {
        message: 'Virtual courtroom session initialized. The join links are now active.',
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'SESSION_EXISTS',
          message: 'A virtual courtroom session already exists for this hearing.',
        });
      }
      throw error;
    }
  }

  /** Active sessions, today's virtual hearings still waiting to be opened, and recently ended sessions. */
  async list() {
    const slots = await this.slots();
    const today = new Date(`${localToday()}T00:00:00.000Z`);
    const [active, awaiting, recent] = await Promise.all([
      this.prisma.courtSession.findMany({
        where: { status: 'ACTIVE' },
        include: {
          hearing: { include: hearingInclude },
          participants: { select: { leftAt: true, lastSeenAt: true, status: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
      this.prisma.hearing.findMany({
        where: {
          isVirtual: true,
          session: { is: null },
          status: 'SCHEDULED',
          date: today,
        },
        include: hearingInclude,
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        take: 50,
      }),
      this.prisma.courtSession.findMany({
        where: { status: 'ENDED' },
        include: { hearing: { include: hearingInclude } },
        orderBy: { endedAt: 'desc' },
        take: 10,
      }),
    ]);
    const now = Date.now();
    return {
      mode: this.provider.kind,
      moderationEnabled: this.provider.moderationEnabled,
      active: active.map((s) => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        hearing: this.hearingSummary(s.hearing, slots),
        liveCount: s.participants.filter(
          (p) =>
            p.status !== 'EJECTED' &&
            !p.leftAt &&
            p.lastSeenAt &&
            now - p.lastSeenAt.getTime() < LIVE_WINDOW_MS,
        ).length,
        participantCount: s.participants.length,
      })),
      awaiting: awaiting.map((h) => this.hearingSummary(h, slots)),
      recent: recent.map((s) => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        hearing: this.hearingSummary(s.hearing, slots),
      })),
    };
  }

  /** The control workspace: session, hearing, room state and the attendee list. */
  async detail(sessionId: string) {
    const s = await this.prisma.courtSession.findUnique({
      where: { id: sessionId },
      include: {
        hearing: { include: hearingInclude },
        initializedBy: { select: { firstName: true, lastName: true } },
        participants: {
          include: participantInclude,
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!s) throw new NotFoundException(Messages.NOT_FOUND);
    const slots = await this.slots();
    const e = this.evaluate(s.hearing, slots);
    const now = new Date();
    const attendees = s.participants.map((p) => this.participantView(p, now));
    return {
      id: s.id,
      status: s.status,
      provider: s.provider,
      mode: this.provider.kind,
      moderationEnabled: this.provider.moderationEnabled,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      initializedBy: fullName(s.initializedBy),
      hearing: this.hearingSummary(s.hearing, slots),
      room: { state: e.state, message: e.message },
      attendees,
      liveCount: attendees.filter((a) => a.live).length,
      serverTime: now,
    };
  }

  /** UC-4.2 Manage Room Participants: records the command; the admin's client applies it through Jitsi. */
  async command(actor: AuthUser, sessionId: string, dto: SessionCommandDto, meta: RequestMeta) {
    if (!this.provider.moderationEnabled) {
      throw new ConflictException({ code: 'MODERATION_UNAVAILABLE', message: MODERATION_REQUIRES_JAAS });
    }
    const p = await this.prisma.courtSessionParticipant.findFirst({
      where: { id: dto.participantId, sessionId },
      include: { ...participantInclude, session: { select: { status: true } } },
    });
    if (!p) throw new NotFoundException(Messages.NOT_FOUND);
    if (p.session.status !== 'ACTIVE') {
      throw new ConflictException({ code: 'SESSION_NOT_ACTIVE', message: SESSION_ENDED_MESSAGE });
    }
    if (p.role === 'ADMIN' || p.role === 'JUDGE') {
      throw new ConflictException({
        code: 'PROTECTED_PARTICIPANT',
        message: 'Commands cannot target the presiding judge or the Admin Bench.',
      });
    }
    if (dto.command === 'READMIT' && p.status !== 'EJECTED') {
      throw new ConflictException({
        code: 'NOT_EJECTED',
        message: 'Only a participant in the lobby can be readmitted.',
      });
    }
    if (dto.command !== 'READMIT' && p.status === 'EJECTED') {
      throw new ConflictException({
        code: 'ALREADY_EJECTED',
        message: 'This participant is already in the lobby.',
      });
    }
    const now = new Date();
    const data: Prisma.CourtSessionParticipantUpdateInput = {
      lastCommand: dto.command,
      lastCommandAt: now,
      lastCommandById: actor.id,
    };
    if (dto.command === 'MUTE_AUDIO') Object.assign(data, { audioMuted: true, status: 'MUTED' });
    if (dto.command === 'DISABLE_VIDEO') {
      Object.assign(data, { videoOff: true, status: p.audioMuted ? 'MUTED' : 'VIDEO_OFF' });
    }
    if (dto.command === 'EJECT') Object.assign(data, { status: 'EJECTED', leftAt: now });
    if (dto.command === 'READMIT') {
      Object.assign(data, { status: derivedStatus(p.audioMuted, p.videoOff) });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.courtSessionParticipant.update({
        where: { id: p.id },
        data,
        include: participantInclude,
      });
      await this.log(
        actor,
        AuditAction.VIRTUAL_SESSION_COMMAND,
        'CourtSession',
        sessionId,
        { participantId: p.id, userId: p.userId, command: dto.command },
        meta,
        tx,
      );
      return row;
    });
    return {
      message: `${COMMAND_DONE[dto.command]}: ${fullName(p.user)}.`,
      participant: this.participantView(updated, now),
    };
  }

  async end(actor: AuthUser, sessionId: string, meta: RequestMeta) {
    const s = await this.prisma.courtSession.findUnique({
      where: { id: sessionId },
      include: { hearing: { select: { caseId: true, date: true, startTime: true } } },
    });
    if (!s) throw new NotFoundException(Messages.NOT_FOUND);
    if (s.status === 'ENDED') {
      throw new ConflictException({
        code: 'SESSION_ENDED',
        message: 'This session has already been marked as ended.',
      });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.courtSession.update({
        where: { id: s.id },
        data: { status: 'ENDED', endedAt: now },
      });
      await tx.courtSessionParticipant.updateMany({
        where: { sessionId: s.id, leftAt: null },
        data: { leftAt: now },
      });
      await tx.caseEvent.create({
        data: {
          caseId: s.hearing.caseId,
          type: CaseEventType.SESSION_ENDED,
          description: `Virtual courtroom session for the hearing on ${ddmmyyyy(s.hearing.date)} ended.`,
          actorId: actor.id,
        },
      });
      await this.log(
        actor,
        AuditAction.VIRTUAL_SESSION_ENDED,
        'CourtSession',
        s.id,
        { hearingId: s.hearingId },
        meta,
        tx,
      );
    });
    return { message: 'Virtual courtroom session marked as ended.' };
  }

  // ------------------------------------------------------------------ parties: UC-3.3

  async status(user: AuthUser, hearingId: string) {
    const h = await this.loadForUser(user, hearingId);
    const e = this.evaluate(h, await this.slots());
    return {
      hearingId: h.id,
      state: e.state,
      message: e.message,
      opensAt: e.opensAt,
      closesAt: e.closesAt,
      sessionId: e.state === 'OPEN' ? (h.session?.id ?? null) : null,
    };
  }

  /** Validates identity, permission and the time window, then hands out the room credentials. */
  async join(user: AuthUser, hearingId: string, meta: RequestMeta) {
    const h = await this.loadForUser(user, hearingId);
    const slots = await this.slots();
    const e = this.evaluate(h, slots);
    if (e.state !== 'OPEN' || !h.session) {
      throw new ConflictException({ code: `ROOM_${e.state}`, message: e.message });
    }
    const session = h.session;
    const existing = await this.prisma.courtSessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
    });
    if (existing?.status === 'EJECTED') {
      throw new ForbiddenException({ code: 'EJECTED', message: EJECTED_MESSAGE });
    }
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true },
    });
    const isModerator = this.isModerator(user, h);
    const participant = await this.prisma.$transaction(async (tx) => {
      const row = await tx.courtSessionParticipant.upsert({
        where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
        update: {},
        create: { sessionId: session.id, userId: user.id, role: participantRoleOf(user.role) },
      });
      await this.log(
        user,
        AuditAction.VIRTUAL_SESSION_JOINED,
        'CourtSession',
        session.id,
        { hearingId: h.id, participantId: row.id },
        meta,
        tx,
      );
      return row;
    });
    const displayName =
      user.role === 'JUDGE'
        ? `Hon. ${fullName(me)} (Judge)`
        : user.role === 'ADMIN'
          ? `${fullName(me)} (Admin Bench)`
          : `${fullName(me)} (${user.role === 'LAWYER' ? 'Counsel' : 'Litigant'})`;
    const creds = this.provider.credentials(session.roomName, {
      id: user.id,
      name: displayName,
      email: me.email,
      moderator: isModerator,
    });
    return {
      ...creds,
      sessionId: session.id,
      participantId: participant.id,
      displayName,
      isModerator,
      moderationEnabled: this.provider.moderationEnabled,
      hearing: this.hearingSummary(h, slots),
    };
  }

  private async ownRow(user: AuthUser, sessionId: string) {
    const p = await this.prisma.courtSessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      include: { session: { select: { status: true } } },
    });
    if (!p) throw new NotFoundException(Messages.NOT_FOUND);
    return p;
  }

  /** Join, leave, mute and heartbeat reports from the participant's own client. */
  async event(user: AuthUser, sessionId: string, dto: SessionEventDto) {
    const p = await this.ownRow(user, sessionId);
    const now = new Date();
    if (dto.type === 'LEFT') {
      await this.prisma.courtSessionParticipant.update({
        where: { id: p.id },
        data: { leftAt: now, lastSeenAt: now },
      });
      return { ok: true };
    }
    if (p.session.status !== 'ACTIVE') {
      throw new ConflictException({ code: 'SESSION_ENDED', message: SESSION_ENDED_MESSAGE });
    }
    if (p.status === 'EJECTED') {
      throw new ForbiddenException({ code: 'EJECTED', message: EJECTED_MESSAGE });
    }
    let { audioMuted, videoOff } = p;
    const data: Prisma.CourtSessionParticipantUpdateInput = { lastSeenAt: now };
    if (dto.type === 'JOINED') {
      Object.assign(data, {
        joinedAt: now,
        leftAt: null,
        providerParticipantId: dto.providerParticipantId ?? p.providerParticipantId,
      });
    }
    if (dto.type === 'AUDIO_MUTED') audioMuted = true;
    if (dto.type === 'AUDIO_UNMUTED') audioMuted = false;
    if (dto.type === 'VIDEO_OFF') videoOff = true;
    if (dto.type === 'VIDEO_ON') videoOff = false;
    Object.assign(data, { audioMuted, videoOff, status: derivedStatus(audioMuted, videoOff) });
    await this.prisma.courtSessionParticipant.update({ where: { id: p.id }, data });
    return { ok: true };
  }

  /** The participant's own row, polled by the room view to apply the admin's commands and notice the end. */
  async me(user: AuthUser, sessionId: string) {
    const p = await this.ownRow(user, sessionId);
    return {
      sessionStatus: p.session.status,
      status: p.status,
      audioMuted: p.audioMuted,
      videoOff: p.videoOff,
      lastCommand: p.lastCommand,
      lastCommandAt: p.lastCommandAt,
      message:
        p.status === 'EJECTED'
          ? EJECTED_MESSAGE
          : p.session.status === 'ENDED'
            ? SESSION_ENDED_MESSAGE
            : null,
    };
  }
}
