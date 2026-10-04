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
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { UCN_REGEX } from '../cases/ucn';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CheckInDto, ResearchLogDto } from './chamber.dto';
import { researchLogSelect, toLogItem } from './chamber-interns.service';
import { dateOnly, haversineM, isoDay, karachiDate, monthStart } from './chamber.util';

export const ATTENDANCE_MESSAGES = {
  CHECKED_IN: 'Attendance logged successfully. Location verified.',
  CHECKED_OUT: 'Check-out logged. Location verified.',
  OUTSIDE:
    'Verification Failed: You must be physically inside the court complex boundaries to log attendance.',
  ALREADY: 'Attendance for today has already been logged.',
  LOW_ACCURACY: 'Location accuracy is too low. Move to an open area and try again.',
  NO_GEOFENCE: 'Attendance cannot be verified yet because no court has a geo-fence configured.',
  NO_CHECK_IN: 'Log your attendance for today before checking out.',
  ALREADY_OUT: 'You have already checked out today.',
};
export const LOG_SAVED = 'Research log saved and linked to chamber files successfully.';

export interface InternContext {
  userId: string;
  internId: string;
  supervisorId: string;
  supervisorUserId: string;
  chamberName: string | null;
}

export const CurrentIntern = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request & { internCtx: InternContext }>().internCtx;
});

/** An intern may use the portal only while a verified, active supervising lawyer is attached. */
@Injectable()
export class InternGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser; internCtx?: InternContext }>();
    if (!req.user || req.user.role !== 'INTERN')
      throw new ForbiddenException('Only interns can use this area.');
    const profile = await this.prisma.internProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        supervisor: {
          select: {
            id: true,
            userId: true,
            verificationStatus: true,
            user: { select: { status: true } },
            chamber: { select: { name: true, licenseStatus: true } },
          },
        },
      },
    });
    const sup = profile?.supervisor;
    if (!profile || !sup || sup.verificationStatus !== 'VERIFIED' || sup.user.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'NO_SUPERVISOR',
        message: 'Your account has no active supervising lawyer. Please contact your chamber.',
      });
    }
    req.internCtx = {
      userId: req.user.id,
      internId: profile.id,
      supervisorId: sup.id,
      supervisorUserId: sup.userId,
      chamberName: sup.chamber?.name ?? null,
    };
    return true;
  }
}

const badField = (field: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: Messages.INVALID_FIELDS,
    details: [{ field, messages: [message] }],
  });
const reject = (status: number, code: string, message: string) =>
  new HttpException({ code, message }, status);

/** The intern's own side: research logs and geo-fenced attendance. */
@Injectable()
export class InternService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  private act(
    ctx: InternContext,
    action: string,
    entity: string,
    entityId: string | undefined,
    meta: RequestMeta,
    metadata?: Prisma.InputJsonValue,
    success = true,
  ) {
    return this.audit.log({
      action,
      actorId: ctx.userId,
      actorRole: 'INTERN',
      entity,
      entityId,
      success,
      metadata,
      ...meta,
    });
  }

  // ------------------------------------------------------------ research logs

  /** Cases the supervising lawyer appears in. */
  async cases(ctx: InternContext) {
    return this.prisma.case.findMany({
      where: { parties: { some: { lawyerId: ctx.supervisorId } }, status: { not: 'DRAFT' } },
      orderBy: { filingDate: 'desc' },
      select: { id: true, ucn: true, title: true },
      take: 200,
    });
  }

  private async resolveCase(ctx: InternContext, caseNumber: string) {
    const ucn = caseNumber.trim().toUpperCase();
    if (!UCN_REGEX.test(ucn))
      throw badField('caseNumber', 'Enter a valid case number like DA-2026-CIV-000001.');
    const c = await this.prisma.case.findFirst({
      where: { ucn, parties: { some: { lawyerId: ctx.supervisorId } } },
      select: { id: true },
    });
    if (!c)
      throw badField(
        'caseNumber',
        'Your supervising lawyer is not counsel in a case with this number.',
      );
    return c.id;
  }

  async createLog(ctx: InternContext, dto: ResearchLogDto, meta: RequestMeta) {
    const caseId = await this.resolveCase(ctx, dto.caseNumber);
    const row = await this.prisma.internDiaryEntry.create({
      data: {
        internId: ctx.internId,
        caseId,
        entryDate: dateOnly(karachiDate()),
        keywords: dto.keywords.map((k) => k.toLowerCase()),
        citation: dto.citation,
        content: dto.notes,
      },
      select: { id: true },
    });
    await this.act(ctx, AuditAction.RESEARCH_LOG_CREATED, 'InternDiaryEntry', row.id, meta);
    await this.notifications.notify(ctx.supervisorUserId, {
      type: 'RESEARCH_SUBMITTED',
      title: 'New research log to review',
      body: `${dto.caseNumber.toUpperCase()}: a new research log was submitted by your intern.`,
    });
    return { message: LOG_SAVED, id: row.id };
  }

  async updateLog(ctx: InternContext, id: string, dto: ResearchLogDto, meta: RequestMeta) {
    const log = await this.prisma.internDiaryEntry.findFirst({
      where: { id, internId: ctx.internId },
      select: { id: true, reviewStatus: true },
    });
    if (!log) throw new NotFoundException(Messages.NOT_FOUND);
    if (log.reviewStatus === 'APPROVED') {
      throw new ConflictException({
        code: 'LOG_LOCKED',
        message: 'This log was approved by your supervisor and can no longer be edited.',
      });
    }
    const caseId = await this.resolveCase(ctx, dto.caseNumber);
    // A returned log goes back to the review queue when it is edited.
    await this.prisma.internDiaryEntry.update({
      where: { id },
      data: {
        caseId,
        keywords: dto.keywords.map((k) => k.toLowerCase()),
        citation: dto.citation,
        content: dto.notes,
        reviewStatus: 'SUBMITTED',
        reviewComment: null,
        reviewerId: null,
        reviewedAt: null,
      },
    });
    await this.act(ctx, AuditAction.RESEARCH_LOG_UPDATED, 'InternDiaryEntry', id, meta);
    return { message: LOG_SAVED, id };
  }

  async listLogs(ctx: InternContext, q: { page: number; limit: number }) {
    const where = { internId: ctx.internId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.internDiaryEntry.count({ where }),
      this.prisma.internDiaryEntry.findMany({
        where,
        select: researchLogSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return { data: rows.map(toLogItem), meta: pageMeta(q.page, q.limit, total) };
  }

  // ------------------------------------------------------------ attendance

  /** Which court geo-fence (if any) contains the point. Server-side haversine. */
  private async locate(dto: CheckInDto) {
    const policy = await this.settings.attendancePolicy();
    const courts = await this.prisma.court.findMany({
      where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, latitude: true, longitude: true, geofenceRadiusM: true },
    });
    let best: { id: string; name: string; distance: number } | null = null;
    for (const c of courts) {
      const distance = haversineM(
        dto.latitude,
        dto.longitude,
        Number(c.latitude),
        Number(c.longitude),
      );
      const radius = c.geofenceRadiusM ?? policy.defaultRadiusM;
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { id: c.id, name: c.name, distance };
      }
    }
    return { policy, hasGeofence: courts.length > 0, best };
  }

  private async verify(ctx: InternContext, dto: CheckInDto, meta: RequestMeta, action: string) {
    const { policy, hasGeofence, best } = await this.locate(dto);
    const fail = async (status: number, code: string, message: string) => {
      // Rejected attempts are written to the audit log only. Coordinates are not stored there.
      await this.act(
        ctx,
        AuditAction.ATTENDANCE_REJECTED,
        'Attendance',
        undefined,
        meta,
        { code, action, accuracyM: Math.round(dto.accuracy) },
        false,
      );
      return reject(status, code, message);
    };
    if (dto.accuracy > policy.maxAccuracyM) {
      throw await fail(422, 'LOW_ACCURACY', ATTENDANCE_MESSAGES.LOW_ACCURACY);
    }
    if (!hasGeofence) throw await fail(409, 'NO_GEOFENCE', ATTENDANCE_MESSAGES.NO_GEOFENCE);
    if (!best) throw await fail(403, 'OUTSIDE_GEOFENCE', ATTENDANCE_MESSAGES.OUTSIDE);
    return best;
  }

  async checkIn(ctx: InternContext, dto: CheckInDto, meta: RequestMeta) {
    const today = karachiDate();
    const date = dateOnly(today);
    const existing = await this.prisma.attendance.findUnique({
      where: { internId_date: { internId: ctx.internId, date } },
      select: { id: true },
    });
    if (existing) throw reject(409, 'ALREADY_LOGGED', ATTENDANCE_MESSAGES.ALREADY);

    const court = await this.verify(ctx, dto, meta, 'check-in');
    try {
      const row = await this.prisma.attendance.create({
        data: {
          internId: ctx.internId,
          date,
          checkInAt: new Date(),
          lat: dto.latitude.toFixed(6),
          lng: dto.longitude.toFixed(6),
          distanceMeters: Math.round(court.distance),
          withinGeofence: true,
          courtId: court.id,
          accuracyM: Math.round(dto.accuracy),
        },
      });
      await this.act(ctx, AuditAction.ATTENDANCE_CHECKIN, 'Attendance', row.id, meta, {
        court: court.name,
      });
      return {
        message: ATTENDANCE_MESSAGES.CHECKED_IN,
        attendance: { date: today, checkInAt: row.checkInAt, court: court.name },
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw reject(409, 'ALREADY_LOGGED', ATTENDANCE_MESSAGES.ALREADY);
      }
      throw e;
    }
  }

  async checkOut(ctx: InternContext, dto: CheckInDto, meta: RequestMeta) {
    const date = dateOnly(karachiDate());
    const row = await this.prisma.attendance.findUnique({
      where: { internId_date: { internId: ctx.internId, date } },
    });
    if (!row) throw reject(409, 'NO_CHECK_IN', ATTENDANCE_MESSAGES.NO_CHECK_IN);
    if (row.checkOutAt) throw reject(409, 'ALREADY_OUT', ATTENDANCE_MESSAGES.ALREADY_OUT);
    const court = await this.verify(ctx, dto, meta, 'check-out');
    const done = await this.prisma.attendance.updateMany({
      where: { id: row.id, checkOutAt: null },
      data: { checkOutAt: new Date() },
    });
    if (done.count !== 1) throw reject(409, 'ALREADY_OUT', ATTENDANCE_MESSAGES.ALREADY_OUT);
    await this.act(ctx, AuditAction.ATTENDANCE_CHECKOUT, 'Attendance', row.id, meta, {
      court: court.name,
    });
    return { message: ATTENDANCE_MESSAGES.CHECKED_OUT };
  }

  async history(ctx: InternContext, month?: string) {
    const m = month ?? karachiDate().slice(0, 7);
    const from = dateOnly(`${m}-01`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const rows = await this.prisma.attendance.findMany({
      where: { internId: ctx.internId, date: { gte: from, lt: to } },
      orderBy: { date: 'desc' },
      include: { court: { select: { name: true } } },
    });
    const today = await this.prisma.attendance.findUnique({
      where: { internId_date: { internId: ctx.internId, date: dateOnly(karachiDate()) } },
      include: { court: { select: { name: true } } },
    });
    const policy = await this.settings.attendancePolicy();
    return {
      month: m,
      today: today
        ? {
            checkInAt: today.checkInAt,
            checkOutAt: today.checkOutAt,
            court: today.court?.name ?? null,
          }
        : null,
      maxAccuracyM: policy.maxAccuracyM,
      data: rows.map((a) => ({
        id: a.id,
        date: isoDay(a.date),
        checkInAt: a.checkInAt,
        checkOutAt: a.checkOutAt,
        court: a.court?.name ?? null,
        verified: a.withinGeofence,
      })),
    };
  }

  async summary(ctx: InternContext) {
    const from = dateOnly(monthStart(karachiDate()));
    const [days, entries, pending, approved, recent, today] = await Promise.all([
      this.prisma.attendance.count({
        where: { internId: ctx.internId, date: { gte: from }, withinGeofence: true },
      }),
      this.prisma.internDiaryEntry.count({ where: { internId: ctx.internId } }),
      this.prisma.internDiaryEntry.count({
        where: { internId: ctx.internId, reviewStatus: 'SUBMITTED' },
      }),
      this.prisma.internDiaryEntry.count({
        where: { internId: ctx.internId, reviewStatus: 'APPROVED' },
      }),
      this.prisma.internDiaryEntry.findMany({
        where: { internId: ctx.internId, reviewedAt: { not: null } },
        orderBy: { reviewedAt: 'desc' },
        take: 5,
        select: researchLogSelect,
      }),
      this.prisma.attendance.findUnique({
        where: { internId_date: { internId: ctx.internId, date: dateOnly(karachiDate()) } },
        select: { id: true },
      }),
    ]);
    return {
      chamberName: ctx.chamberName,
      daysThisMonth: days,
      entries,
      pendingReviews: pending,
      approved,
      checkedInToday: Boolean(today),
      recentReviews: recent.map(toLogItem),
    };
  }
}
