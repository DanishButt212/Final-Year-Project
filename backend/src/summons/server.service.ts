import {
  BadRequestException,
  CanActivate,
  ConflictException,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { dateOnly, karachiDate } from '../chamber/chamber.util';
import { caseAudience } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { EvidenceCryptoService } from '../evidence/evidence-crypto.service';
import { CaseEventType, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { isOverdue, OPEN_STATUSES } from './summons-admin.service';
import { SealService } from './seal.service';
import {
  isImage,
  MAX_PHOTO_BYTES,
  MAX_PROFILE_PHOTO_BYTES,
  MAX_SIGNATURE_BYTES,
  screeningFailed,
  uploaded,
} from './summons.files';
import { AttemptDto, FinalizeDto, TELEMETRY_ERROR, UpdateServerProfileDto } from './summons.dto';

export const MESSAGES = {
  ATTEMPT: 'Progress log entry committed.',
  EXECUTED: 'Summons execution proof secured.',
  PROFILE: 'Staff identity profiles synchronized.',
  EMPTY_ROSTER: 'No outstanding summons found in your queue.',
};

export interface ServerContext {
  userId: string;
  profileId: string;
}

export const CurrentServer = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request & { serverCtx: ServerContext }>().serverCtx;
});

/** Only process servers with an ACTIVE staff profile may act; suspended servers get 403. */
@Injectable()
export class ServerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser; serverCtx?: ServerContext }>();
    if (!req.user || req.user.role !== 'PROCESS_SERVER') throw new ForbiddenException();
    const p = await this.prisma.processServerProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, status: true },
    });
    if (!p || p.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'SERVER_SUSPENDED',
        message: 'Your staff profile is not active. Please contact the registry.',
      });
    }
    req.serverCtx = { userId: req.user.id, profileId: p.id };
    return true;
  }
}

interface Telemetry {
  latitude: string;
  longitude: string;
  accuracyM: string;
}

const telemetryError = () =>
  new HttpException({ code: 'TELEMETRY_ERROR', message: TELEMETRY_ERROR }, 422);

@Injectable()
export class ServerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly crypto: EvidenceCryptoService,
    private readonly storage: StorageService,
    private readonly seals: SealService,
  ) {}

  /** Latitude, longitude and accuracy are mandatory and the accuracy must be within the policy. */
  private async telemetry(dto: AttemptDto): Promise<Telemetry> {
    const num = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(v));
    const lat = num(dto.latitude);
    const lng = num(dto.longitude);
    const acc = num(dto.accuracyM);
    const policy = await this.settings.summonsPolicy();
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(acc) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      acc < 0 ||
      acc > policy.maxGpsAccuracyM
    ) {
      throw telemetryError();
    }
    return { latitude: lat.toFixed(6), longitude: lng.toFixed(6), accuracyM: acc.toFixed(2) };
  }

  private async own(ctx: ServerContext, id: string) {
    const s = await this.prisma.summons.findFirst({
      where: { id, serverId: ctx.userId },
      include: {
        case: { select: { id: true, ucn: true, title: true } },
        attempts: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!s) throw new NotFoundException(Messages.NOT_FOUND);
    return s;
  }

  private view(
    s: Prisma.SummonsGetPayload<{
      include: { case: { select: { id: true; ucn: true; title: true } }; attempts: true };
    }>,
  ) {
    return {
      id: s.id,
      caseId: s.caseId,
      ucn: s.case.ucn,
      caseTitle: s.case.title,
      noticeType: s.noticeType,
      recipientName: s.recipientName,
      serviceAddress: s.serviceAddress,
      sector: s.sector,
      priority: s.priority,
      status: s.status,
      dueBy: s.dueBy,
      overdue: isOverdue(s.dueBy, s.status),
      executedAt: s.executedAt,
      serviceMode: s.serviceMode,
      attemptCount: s.attempts.length,
      attempts: s.attempts.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        accuracyM: a.accuracyM.toFixed(2),
        notes: a.notes,
      })),
    };
  }

  async roster(ctx: ServerContext) {
    const rows = await this.prisma.summons.findMany({
      where: { serverId: ctx.userId, status: { in: ['ASSIGNED', 'ATTEMPT_IN_PROGRESS'] } },
      include: {
        case: { select: { id: true, ucn: true, title: true } },
        attempts: { orderBy: { createdAt: 'asc' } },
      },
    });
    const items = rows.map((s) => this.view(s));
    // Overdue first, then urgent before normal, then the earliest due date, then sector.
    items.sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT') ||
        (a.dueBy?.getTime() ?? Infinity) - (b.dueBy?.getTime() ?? Infinity) ||
        a.sector.localeCompare(b.sector),
    );
    return { data: items, ...(items.length === 0 ? { message: MESSAGES.EMPTY_ROSTER } : {}) };
  }

  async detail(ctx: ServerContext, id: string) {
    return this.view(await this.own(ctx, id));
  }

  async summary(ctx: ServerContext) {
    const today = dateOnly(karachiDate());
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const [open, executed, overdue] = await Promise.all([
      this.prisma.summons.count({
        where: { serverId: ctx.userId, status: { in: [...OPEN_STATUSES] } },
      }),
      this.prisma.summons.count({
        where: { serverId: ctx.userId, status: 'EXECUTED', executedAt: { gte: monday } },
      }),
      this.prisma.summons.count({
        where: { serverId: ctx.userId, status: { in: [...OPEN_STATUSES] }, dueBy: { lt: today } },
      }),
    ]);
    return { open, executedThisWeek: executed, overdue };
  }

  async attempt(ctx: ServerContext, id: string, dto: AttemptDto, meta: RequestMeta) {
    const t = await this.telemetry(dto);
    const s = await this.own(ctx, id);
    if (s.status !== 'ASSIGNED' && s.status !== 'ATTEMPT_IN_PROGRESS') {
      throw new ConflictException({
        code: 'SUMMONS_LOCKED',
        message: 'This summons is closed and cannot be changed.',
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const done = await tx.summons.updateMany({
        where: { id, serverId: ctx.userId, status: { in: ['ASSIGNED', 'ATTEMPT_IN_PROGRESS'] } },
        data: { status: 'ATTEMPT_IN_PROGRESS' },
      });
      if (done.count !== 1) {
        throw new ConflictException({
          code: 'SUMMONS_LOCKED',
          message: 'This summons is closed and cannot be changed.',
        });
      }
      const a = await tx.summonsAttempt.create({
        data: { summonsId: id, serverId: ctx.userId, ...t, notes: dto.notes },
      });
      // No actor on the case event: filers and lawyers never learn who the server is or where they stood.
      await tx.caseEvent.create({
        data: {
          caseId: s.caseId,
          type: CaseEventType.SUMMONS_ATTEMPT,
          description: `Service attempt on ${s.recipientName}: ${dto.notes}`,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.SUMMONS_ATTEMPT,
        actorId: ctx.userId,
        actorRole: 'PROCESS_SERVER',
        entity: 'Summons',
        entityId: id,
        metadata: { attemptId: a.id },
        ...meta,
      });
      return a;
    });
    return { message: MESSAGES.ATTEMPT, attempt: { id: row.id, createdAt: row.createdAt } };
  }

  async finalize(
    ctx: ServerContext,
    id: string,
    dto: FinalizeDto,
    req: Request,
    meta: RequestMeta,
  ) {
    const t = await this.telemetry(dto);
    const s = await this.own(ctx, id);
    if (s.status === 'ASSIGNED') {
      throw new ConflictException({
        code: 'NO_ATTEMPT',
        message: 'Commit a progress log entry (Attempt in Progress) before finalizing.',
      });
    }
    if (s.status !== 'ATTEMPT_IN_PROGRESS') {
      throw new ConflictException({
        code: 'SUMMONS_LOCKED',
        message: 'This summons is closed and cannot be changed.',
      });
    }
    const photo = uploaded(req, 'photo');
    const signature = uploaded(req, 'signature');
    const personal = dto.serviceMode === 'PERSONAL_DELIVERY';
    // Photo is always mandatory; the signature only when the notice was delivered in person.
    if (!photo || (personal && !signature)) throw screeningFailed();
    if (!(await isImage(photo, MAX_PHOTO_BYTES, ['jpeg', 'png']))) throw screeningFailed();
    if (signature && !(await isImage(signature, MAX_SIGNATURE_BYTES, ['png'])))
      throw screeningFailed();

    const base = `summons/${id}`;
    const photoKey = `${base}/photo-${randomUUID()}`;
    const sigKey = signature && personal ? `${base}/signature-${randomUUID()}` : null;
    const stored: string[] = [];
    try {
      const p = await this.crypto.encryptToStorage(photo.path, photoKey);
      stored.push(photoKey);
      const sg =
        sigKey && signature ? await this.crypto.encryptToStorage(signature.path, sigKey) : null;
      if (sigKey) stored.push(sigKey);

      const executedAt = new Date();
      const seal = this.seals.seal({
        summonsId: id,
        serverId: ctx.userId,
        serviceMode: dto.serviceMode,
        executedAt,
        ...t,
        notes: dto.notes,
        photoSha256: p.sha256,
        signatureSha256: sg?.sha256 ?? null,
      });
      await this.prisma.$transaction(async (tx) => {
        const done = await tx.summons.updateMany({
          where: { id, serverId: ctx.userId, status: 'ATTEMPT_IN_PROGRESS' },
          data: {
            status: 'EXECUTED',
            serviceMode: dto.serviceMode,
            executedAt,
            executedLat: t.latitude,
            executedLng: t.longitude,
            executedAccuracy: t.accuracyM,
            executionNotes: dto.notes,
            photoPath: photoKey,
            photoIv: p.iv,
            photoTag: p.authTag,
            photoSha256: p.sha256,
            signaturePath: sigKey,
            signatureIv: sg?.iv ?? null,
            signatureTag: sg?.authTag ?? null,
            signatureSha256: sg?.sha256 ?? null,
            seal,
            sealedAt: executedAt,
          },
        });
        if (done.count !== 1) {
          throw new ConflictException({
            code: 'SUMMONS_LOCKED',
            message: 'This summons is closed and cannot be changed.',
          });
        }
        await tx.caseEvent.create({
          data: {
            caseId: s.caseId,
            type: CaseEventType.SUMMONS_EXECUTED,
            description: `Summons to ${s.recipientName} executed (${personal ? 'delivered in person' : 'refused, affixed to gate'}).`,
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.SUMMONS_EXECUTED,
          actorId: ctx.userId,
          actorRole: 'PROCESS_SERVER',
          entity: 'Summons',
          entityId: id,
          metadata: { serviceMode: dto.serviceMode },
          ...meta,
        });
        const audience = await caseAudience(tx, s.caseId);
        await this.notifications.notifyMany(
          audience,
          {
            type: 'SUMMONS_EXECUTED',
            title: 'Summons executed',
            body: `The summons to ${s.recipientName} in ${s.case.ucn} was served.`,
          },
          tx,
        );
      });
    } catch (e) {
      for (const k of stored) await this.storage.remove(k).catch(() => undefined);
      throw e;
    }
    return { message: MESSAGES.EXECUTED };
  }

  // ------------------------------------------------------------ profile

  private profileView(
    p: Prisma.ProcessServerProfileGetPayload<{ include: { court: true; user: true } }>,
  ) {
    return {
      name: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      badgeNumber: p.badgeNumber,
      badgeStatus: p.status,
      precinct: p.court.name,
      sector: p.sector,
      phone: p.phone ?? p.user.phone,
      hasPhoto: Boolean(p.photoPath),
    };
  }

  async profile(ctx: ServerContext) {
    const p = await this.prisma.processServerProfile.findUniqueOrThrow({
      where: { userId: ctx.userId },
      include: { court: true, user: true },
    });
    return this.profileView(p);
  }

  async updateProfile(
    ctx: ServerContext,
    dto: UpdateServerProfileDto,
    req: Request,
    meta: RequestMeta,
  ) {
    const photo = uploaded(req, 'photo');
    if (!dto.phone && !photo) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [{ field: 'phone', messages: ['Enter a phone number or choose a new photo.'] }],
      });
    }
    let enc: { key: string; iv: string; authTag: string; sha256: string } | null = null;
    if (photo) {
      if (!(await isImage(photo, MAX_PROFILE_PHOTO_BYTES, ['jpeg', 'png'])))
        throw screeningFailed();
      const key = `servers/${ctx.userId}/photo-${randomUUID()}`;
      const r = await this.crypto.encryptToStorage(photo.path, key);
      enc = { key, iv: r.iv, authTag: r.authTag, sha256: r.sha256 };
    }
    const before = await this.prisma.processServerProfile.findUniqueOrThrow({
      where: { userId: ctx.userId },
      select: { photoPath: true },
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processServerProfile.update({
          where: { userId: ctx.userId },
          data: {
            ...(dto.phone ? { phone: dto.phone } : {}),
            ...(enc
              ? {
                  photoPath: enc.key,
                  photoIv: enc.iv,
                  photoTag: enc.authTag,
                  photoSha256: enc.sha256,
                }
              : {}),
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.SERVER_PROFILE_UPDATED,
          actorId: ctx.userId,
          actorRole: 'PROCESS_SERVER',
          entity: 'ProcessServerProfile',
          entityId: ctx.profileId,
          metadata: { phone: Boolean(dto.phone), photo: Boolean(enc) },
          ...meta,
        });
      });
    } catch (e) {
      if (enc) await this.storage.remove(enc.key).catch(() => undefined);
      throw e;
    }
    if (enc && before.photoPath) await this.storage.remove(before.photoPath).catch(() => undefined);
    return { message: MESSAGES.PROFILE, profile: await this.profile(ctx) };
  }

  async profilePhoto(ctx: ServerContext) {
    const p = await this.prisma.processServerProfile.findUniqueOrThrow({
      where: { userId: ctx.userId },
    });
    if (!p.photoPath || !p.photoIv || !p.photoTag || !(await this.storage.exists(p.photoPath))) {
      throw new NotFoundException(Messages.NOT_FOUND);
    }
    return new StreamableFile(this.crypto.decryptStream(p.photoPath, p.photoIv, p.photoTag), {
      type: 'image/jpeg',
    });
  }
}
