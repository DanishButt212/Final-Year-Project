import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { dateOnly, karachiDate } from '../chamber/chamber.util';
import { caseAudience } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { EvidenceCryptoService } from '../evidence/evidence-crypto.service';
import { CaseEventType, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import {
  AssignDto,
  CancelDto,
  IssueSummonsDto,
  ServerListQueryDto,
  SummonsListQueryDto,
} from './summons.dto';
import { SealService } from './seal.service';

export const OPEN_STATUSES = ['PENDING_ASSIGNMENT', 'ASSIGNED', 'ATTEMPT_IN_PROGRESS'] as const;
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const fieldError = (field: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: Messages.INVALID_FIELDS,
    details: [{ field, messages: [message] }],
  });

export const isOverdue = (dueBy: Date | null, status: string, today = karachiDate()) =>
  Boolean(
    dueBy &&
    (OPEN_STATUSES as readonly string[]).includes(status) &&
    dueBy.toISOString().slice(0, 10) < today,
  );

const listInclude = {
  case: {
    select: { id: true, ucn: true, title: true, court: { select: { id: true, name: true } } },
  },
  server: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      serverProfile: { select: { badgeNumber: true } },
    },
  },
  _count: { select: { attempts: true } },
} satisfies Prisma.SummonsInclude;

type ListRow = Prisma.SummonsGetPayload<{ include: typeof listInclude }>;

function toItem(s: ListRow) {
  return {
    id: s.id,
    caseId: s.caseId,
    ucn: s.case.ucn,
    caseTitle: s.case.title,
    court: s.case.court?.name ?? null,
    noticeType: s.noticeType,
    recipientName: s.recipientName,
    serviceAddress: s.serviceAddress,
    sector: s.sector,
    priority: s.priority,
    status: s.status,
    dueBy: s.dueBy,
    overdue: isOverdue(s.dueBy, s.status),
    issuedAt: s.issuedAt,
    executedAt: s.executedAt,
    serviceMode: s.serviceMode,
    attemptCount: s._count.attempts,
    server: s.server
      ? {
          id: s.server.id,
          name: fullName(s.server),
          badgeNumber: s.server.serverProfile?.badgeNumber ?? null,
        }
      : null,
  };
}

/** Admin side of summons and notices: issue, assign, reassign, cancel, view the proof and verify its seal. */
@Injectable()
export class SummonsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly crypto: EvidenceCryptoService,
    private readonly storage: StorageService,
    private readonly seals: SealService,
  ) {}

  private async activeServer(id: string) {
    const profile = await this.prisma.processServerProfile.findFirst({
      where: { userId: id, status: 'ACTIVE', user: { status: 'ACTIVE', role: 'PROCESS_SERVER' } },
      select: { userId: true, sector: true },
    });
    if (!profile) throw fieldError('serverId', 'Choose an active process server.');
    return profile;
  }

  async issue(actor: AuthUser, dto: IssueSummonsDto, meta: RequestMeta) {
    const c = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      select: { id: true, ucn: true, judgeId: true },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    if (!c.judgeId) {
      throw conflict(
        'CASE_NOT_ALLOCATED',
        'Summons can only be issued for a case allocated to a bench.',
      );
    }
    if (dto.partyId) {
      const p = await this.prisma.caseParty.findFirst({
        where: { id: dto.partyId, caseId: c.id },
        select: { id: true },
      });
      if (!p) throw fieldError('partyId', 'This party does not belong to the case.');
    }
    const today = karachiDate();
    const policy = await this.settings.summonsPolicy();
    let due = dto.dueDate?.slice(0, 10);
    if (!due) {
      const d = dateOnly(today);
      d.setUTCDate(d.getUTCDate() + policy.defaultDueDays);
      due = d.toISOString().slice(0, 10);
    }
    if (due < today) throw fieldError('dueDate', 'The due date must be today or later.');
    if (dto.assignedServerId) await this.activeServer(dto.assignedServerId);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.summons.create({
        data: {
          caseId: c.id,
          partyId: dto.partyId,
          noticeType: dto.noticeType,
          recipientName: dto.recipientName,
          recipientCnic: dto.recipientCnic,
          serviceAddress: dto.serviceAddress,
          sector: dto.sector,
          priority: dto.priority,
          dueBy: dateOnly(due as string),
          issuedById: actor.id,
          serverId: dto.assignedServerId,
          status: dto.assignedServerId ? 'ASSIGNED' : 'PENDING_ASSIGNMENT',
        },
      });
      await tx.caseEvent.create({
        data: {
          caseId: c.id,
          type: CaseEventType.SUMMONS_ISSUED,
          description: `${dto.noticeType === 'SUMMONS' ? 'Summons' : 'Notice'} issued to ${dto.recipientName}.`,
          actorId: actor.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.SUMMONS_ISSUED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Summons',
        entityId: row.id,
        metadata: { caseId: c.id, priority: dto.priority, assigned: Boolean(dto.assignedServerId) },
        ...meta,
      });
      if (dto.assignedServerId) {
        await this.notifications.notify(
          dto.assignedServerId,
          {
            type: 'SUMMONS_ASSIGNED',
            title: 'New summons assigned',
            body: `${dto.recipientName} (${c.ucn}), due ${due}.`,
          },
          tx,
        );
      }
      return row;
    });
    return {
      message: dto.assignedServerId
        ? 'Summons issued and assigned successfully.'
        : 'Summons issued and waiting for assignment.',
      id: created.id,
    };
  }

  async list(q: SummonsListQueryDto) {
    const today = karachiDate();
    const where: Prisma.SummonsWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.serverId ? { serverId: q.serverId } : {}),
      ...(q.sector ? { sector: { contains: q.sector, mode: 'insensitive' } } : {}),
      ...(q.courtId ? { case: { courtId: q.courtId } } : {}),
      ...(q.overdue ? { status: { in: [...OPEN_STATUSES] }, dueBy: { lt: dateOnly(today) } } : {}),
      ...(q.search
        ? {
            OR: [
              { recipientName: { contains: q.search, mode: 'insensitive' } },
              { case: { ucn: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.summons.count({ where }),
      this.prisma.summons.findMany({
        where,
        include: listInclude,
        orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return { data: rows.map(toItem), meta: pageMeta(q.page, q.limit, total) };
  }

  private async load(id: string) {
    const s = await this.prisma.summons.findUnique({
      where: { id },
      include: {
        ...listInclude,
        attempts: { orderBy: { createdAt: 'asc' } },
        issuedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!s) throw new NotFoundException(Messages.NOT_FOUND);
    return s;
  }

  async detail(id: string) {
    const s = await this.load(id);
    return {
      ...toItem(s),
      recipientCnic: s.recipientCnic,
      issuedBy: s.issuedBy ? fullName(s.issuedBy) : null,
      cancelReason: s.cancelReason,
      cancelledAt: s.cancelledAt,
      attempts: s.attempts.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        latitude: a.latitude.toFixed(6),
        longitude: a.longitude.toFixed(6),
        accuracyM: a.accuracyM.toFixed(2),
        notes: a.notes,
      })),
      proof:
        s.status === 'EXECUTED'
          ? {
              executedAt: s.executedAt,
              serviceMode: s.serviceMode,
              latitude: s.executedLat?.toFixed(6) ?? null,
              longitude: s.executedLng?.toFixed(6) ?? null,
              accuracyM: s.executedAccuracy?.toFixed(2) ?? null,
              notes: s.executionNotes,
              hasPhoto: Boolean(s.photoPath),
              hasSignature: Boolean(s.signaturePath),
              photoSha256: s.photoSha256,
              signatureSha256: s.signatureSha256,
              sealedAt: s.sealedAt,
              seal: s.seal,
            }
          : null,
    };
  }

  /** Assign (first time) or reassign. History stays in CaseEvent and the audit log. */
  async assign(actor: AuthUser, id: string, dto: AssignDto, meta: RequestMeta) {
    const s = await this.load(id);
    if (!(OPEN_STATUSES as readonly string[]).includes(s.status)) {
      throw conflict('SUMMONS_LOCKED', 'An executed or cancelled summons cannot be reassigned.');
    }
    if (s.serverId === dto.serverId) {
      throw conflict('SAME_SERVER', 'This summons is already assigned to that process server.');
    }
    await this.activeServer(dto.serverId);
    const reassigned = Boolean(s.serverId);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.summons.updateMany({
        where: { id, status: { in: [...OPEN_STATUSES] } },
        data: {
          serverId: dto.serverId,
          status: s.status === 'PENDING_ASSIGNMENT' ? 'ASSIGNED' : s.status,
        },
      });
      if (done.count !== 1)
        throw conflict('SUMMONS_LOCKED', 'This summons can no longer be changed.');
      await tx.caseEvent.create({
        data: {
          caseId: s.caseId,
          type: CaseEventType.SUMMONS_REASSIGNED,
          description: `Summons for ${s.recipientName} ${reassigned ? 'reassigned to another process server' : 'assigned to a process server'}.`,
          actorId: actor.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.SUMMONS_REASSIGNED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Summons',
        entityId: id,
        metadata: { from: s.serverId, to: dto.serverId },
        ...meta,
      });
      await this.notifications.notify(
        dto.serverId,
        {
          type: 'SUMMONS_ASSIGNED',
          title: reassigned ? 'Summons reassigned to you' : 'New summons assigned',
          body: `${s.recipientName} (${s.case.ucn}).`,
        },
        tx,
      );
      if (s.serverId) {
        await this.notifications.notify(
          s.serverId,
          {
            type: 'SUMMONS_ASSIGNED',
            title: 'Summons reassigned',
            body: `${s.recipientName} (${s.case.ucn}) was moved to another process server.`,
          },
          tx,
        );
      }
    });
    return { message: reassigned ? 'Summons reassigned.' : 'Summons assigned.' };
  }

  async cancel(actor: AuthUser, id: string, dto: CancelDto, meta: RequestMeta) {
    const s = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.summons.updateMany({
        where: { id, status: { in: [...OPEN_STATUSES] } },
        data: { status: 'CANCELLED', cancelReason: dto.reason, cancelledAt: new Date() },
      });
      if (done.count !== 1) {
        throw conflict('SUMMONS_LOCKED', 'An executed or cancelled summons cannot be cancelled.');
      }
      await tx.caseEvent.create({
        data: {
          caseId: s.caseId,
          type: CaseEventType.SUMMONS_CANCELLED,
          description: `Summons for ${s.recipientName} cancelled by the registry.`,
          actorId: actor.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.SUMMONS_CANCELLED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Summons',
        entityId: id,
        metadata: { reason: dto.reason },
        ...meta,
      });
      if (s.serverId) {
        await this.notifications.notify(
          s.serverId,
          {
            type: 'SUMMONS_ASSIGNED',
            title: 'Summons cancelled',
            body: `${s.recipientName} (${s.case.ucn}) was cancelled by the registry.`,
          },
          tx,
        );
      }
    });
    return { message: 'Summons cancelled.' };
  }

  /** Decrypted proof photo or signature for admins and the judge of the case. */
  async proofFile(user: AuthUser, id: string, kind: 'photo' | 'signature', meta: RequestMeta) {
    const s = await this.prisma.summons.findUnique({
      where: { id },
      include: { case: { select: { judgeId: true } } },
    });
    if (!s || s.status !== 'EXECUTED') throw new NotFoundException(Messages.NOT_FOUND);
    if (user.role === 'JUDGE' && s.case.judgeId !== user.id)
      throw new NotFoundException(Messages.NOT_FOUND);
    if (user.role !== 'JUDGE' && user.role !== 'ADMIN') throw new ForbiddenException();
    const f =
      kind === 'photo'
        ? { path: s.photoPath, iv: s.photoIv, tag: s.photoTag }
        : { path: s.signaturePath, iv: s.signatureIv, tag: s.signatureTag };
    if (!f.path || !f.iv || !f.tag || !(await this.storage.exists(f.path))) {
      throw new NotFoundException(Messages.NOT_FOUND);
    }
    await this.audit.log({
      action: AuditAction.SUMMONS_PROOF_VIEWED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Summons',
      entityId: id,
      metadata: { kind },
      ...meta,
    });
    return new StreamableFile(this.crypto.decryptStream(f.path, f.iv, f.tag), {
      type: kind === 'photo' ? 'image/jpeg' : 'image/png',
      disposition: `inline; filename="${kind}-${id}"`,
    });
  }

  private async sha(stream: Readable): Promise<string | null> {
    try {
      const h = createHash('sha256');
      for await (const chunk of stream) h.update(chunk as Buffer);
      return h.digest('hex');
    } catch {
      return null; // GCM authentication failed: the stored file was altered
    }
  }

  /** Recomputes the seal and re-hashes the stored files. */
  async verifySeal(actor: AuthUser, id: string, meta: RequestMeta) {
    const s = await this.prisma.summons.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(Messages.NOT_FOUND);
    if (s.status !== 'EXECUTED' || !s.seal || !s.executedAt || !s.photoSha256) {
      throw conflict('NO_PROOF', 'This summons has no sealed execution proof.');
    }
    let valid = this.seals.matches(
      {
        summonsId: s.id,
        serverId: s.serverId as string,
        serviceMode: s.serviceMode as string,
        executedAt: s.executedAt,
        latitude: (s.executedLat as Prisma.Decimal).toFixed(6),
        longitude: (s.executedLng as Prisma.Decimal).toFixed(6),
        accuracyM: (s.executedAccuracy as Prisma.Decimal).toFixed(2),
        notes: s.executionNotes ?? '',
        photoSha256: s.photoSha256,
        signatureSha256: s.signatureSha256,
      },
      s.seal,
    );
    if (valid && s.photoPath && s.photoIv && s.photoTag) {
      valid =
        (await this.sha(this.crypto.decryptStream(s.photoPath, s.photoIv, s.photoTag))) ===
        s.photoSha256;
    }
    if (valid && s.signaturePath && s.signatureIv && s.signatureTag) {
      valid =
        (await this.sha(
          this.crypto.decryptStream(s.signaturePath, s.signatureIv, s.signatureTag),
        )) === s.signatureSha256;
    }
    await this.audit.log({
      action: AuditAction.SUMMONS_SEAL_VERIFIED,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'Summons',
      entityId: id,
      success: valid,
      metadata: { result: valid ? 'valid' : 'tampered' },
      ...meta,
    });
    return {
      result: valid ? 'valid' : 'tampered',
      message: valid
        ? 'The seal is valid: the proof is unchanged since it was sealed.'
        : 'The seal does not match: the proof or its files were altered.',
      sealedAt: s.sealedAt,
    };
  }

  /** Active process servers with their open workload. */
  async servers(q: ServerListQueryDto) {
    const profiles = await this.prisma.processServerProfile.findMany({
      where: {
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        ...(q.courtId ? { courtId: q.courtId } : {}),
        ...(q.sector ? { sector: { contains: q.sector, mode: 'insensitive' } } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        court: { select: { id: true, name: true } },
      },
      orderBy: { badgeNumber: 'asc' },
    });
    const load = await this.prisma.summons.groupBy({
      by: ['serverId'],
      where: {
        serverId: { in: profiles.map((p) => p.userId) },
        status: { in: ['ASSIGNED', 'ATTEMPT_IN_PROGRESS'] },
      },
      _count: { _all: true },
    });
    const m = new Map(load.map((l) => [l.serverId, l._count._all]));
    return profiles.map((p) => ({
      id: p.user.id,
      name: fullName(p.user),
      badgeNumber: p.badgeNumber,
      sector: p.sector,
      court: p.court.name,
      courtId: p.court.id,
      openWorkload: m.get(p.userId) ?? 0,
    }));
  }

  /** Parties of an allocated case, for the "Issue summons" picker. */
  async caseParties(caseId: string) {
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        ucn: true,
        title: true,
        judgeId: true,
        parties: { select: { id: true, name: true, role: true, address: true, cnic: true } },
      },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    return { ...c, allocated: Boolean(c.judgeId), judgeId: undefined };
  }

  audience(caseId: string) {
    return caseAudience(this.prisma, caseId);
  }
}
