import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { hashToken } from '../auth/auth.service';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { MockMailerService } from '../integrations/mock-mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInternDto, InternStatusDto, ResearchLogQueryDto, ReviewLogDto } from './chamber.dto';
import { ChamberContext } from './chamber.guard';
import { dateOnly, isoDay, karachiDate, monthStart } from './chamber.util';

const PROVISION_LINK_HOURS = 72;

export const researchLogSelect = {
  id: true,
  entryDate: true,
  keywords: true,
  citation: true,
  content: true,
  reviewStatus: true,
  reviewComment: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  case: { select: { id: true, ucn: true, title: true } },
  intern: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.InternDiaryEntrySelect;

type LogRow = Prisma.InternDiaryEntryGetPayload<{ select: typeof researchLogSelect }>;

export const toLogItem = (r: LogRow) => ({
  id: r.id,
  entryDate: r.entryDate,
  caseId: r.case?.id ?? null,
  ucn: r.case?.ucn ?? null,
  caseTitle: r.case?.title ?? null,
  keywords: r.keywords,
  citation: r.citation,
  notes: r.content,
  status: r.reviewStatus,
  reviewComment: r.reviewComment,
  reviewedAt: r.reviewedAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  internId: r.intern.id,
  internName: `${r.intern.user.firstName} ${r.intern.user.lastName}`,
});

const conflict = (code: string, message: string) => new ConflictException({ code, message });

/** The supervising lawyer's side of the internship: accounts, attendance overview and research log review. */
@Injectable()
export class ChamberInternsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mailer: MockMailerService,
    private readonly notifications: NotificationsService,
  ) {}

  private async internOrThrow(ctx: ChamberContext, id: string) {
    const intern = await this.prisma.internProfile.findFirst({
      where: { id, supervisorId: ctx.lawyerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            cnic: true,
            status: true,
          },
        },
      },
    });
    if (!intern) throw new NotFoundException(Messages.NOT_FOUND);
    return intern;
  }

  async list(ctx: ChamberContext) {
    const month = dateOnly(monthStart(karachiDate()));
    const interns = await this.prisma.internProfile.findMany({
      where: { supervisorId: ctx.lawyerId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true, status: true },
        },
        _count: { select: { diary: true } },
      },
    });
    const ids = interns.map((i) => i.id);
    const [days, last, pending] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['internId'],
        where: { internId: { in: ids }, date: { gte: month }, withinGeofence: true },
        _count: { _all: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['internId'],
        where: { internId: { in: ids } },
        _max: { checkInAt: true },
      }),
      this.prisma.internDiaryEntry.groupBy({
        by: ['internId'],
        where: { internId: { in: ids }, reviewStatus: 'SUBMITTED' },
        _count: { _all: true },
      }),
    ]);
    const d = new Map(days.map((x) => [x.internId, x._count._all]));
    const l = new Map(last.map((x) => [x.internId, x._max.checkInAt]));
    const p = new Map(pending.map((x) => [x.internId, x._count._all]));
    return interns.map((i) => ({
      id: i.id,
      name: `${i.user.firstName} ${i.user.lastName}`,
      email: i.user.email,
      phone: i.user.phone,
      status: i.user.status,
      startDate: i.startDate,
      entries: i._count.diary,
      pendingReviews: p.get(i.id) ?? 0,
      daysThisMonth: d.get(i.id) ?? 0,
      lastCheckInAt: l.get(i.id) ?? null,
    }));
  }

  async create(ctx: ChamberContext, dto: CreateInternDto, meta: RequestMeta) {
    const duplicate = await this.prisma.user.findFirst({
      where: { OR: [{ cnic: dto.cnic }, { email: dto.email }] },
      select: { id: true },
    });
    if (duplicate) throw conflict('DUPLICATE_IDENTIFIER', Messages.DUPLICATE_IDENTIFIER);

    const rounds = this.config.getOrThrow<number>('BCRYPT_ROUNDS');
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), rounds);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PROVISION_LINK_HOURS * 3_600_000);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            role: 'INTERN',
            firstName: dto.firstName,
            lastName: dto.lastName,
            cnic: dto.cnic,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            notificationPreference: { create: {} },
            passwordResetTokens: { create: { tokenHash: hashToken(token), expiresAt } },
            internProfile: {
              create: { supervisorId: ctx.lawyerId, startDate: dateOnly(dto.startDate) },
            },
          },
          include: { internProfile: true },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.INTERN_CREATED,
          actorId: ctx.userId,
          actorRole: 'LAWYER',
          entity: 'User',
          entityId: user.id,
          metadata: { chamber: ctx.chamber.chamberCode },
          ...meta,
        });
        return user;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('DUPLICATE_IDENTIFIER', Messages.DUPLICATE_IDENTIFIER);
      }
      throw e;
    }
    const origin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
    const resetLink = `${origin}/reset-password?token=${token}`;
    this.mailer.send(
      created.email,
      'Your DigitalAdaalat intern account',
      `${ctx.chamber.name} created an intern account for you. Open this link to choose your password (valid ${PROVISION_LINK_HOURS} hours):\n${resetLink}`,
    );
    return {
      message: 'Intern account created.',
      intern: { id: created.internProfile?.id, name: `${created.firstName} ${created.lastName}` },
      resetLink,
      expiresAt,
    };
  }

  async setStatus(ctx: ChamberContext, id: string, dto: InternStatusDto, meta: RequestMeta) {
    const intern = await this.internOrThrow(ctx, id);
    const from = intern.user.status;
    if (dto.action === 'deactivate') {
      if (from !== 'ACTIVE')
        throw conflict('INVALID_STATUS_CHANGE', 'Only an active intern can be deactivated.');
    } else if (from !== 'SUSPENDED') {
      throw conflict('INVALID_STATUS_CHANGE', 'Only a deactivated intern can be reactivated here.');
    }
    const to = dto.action === 'deactivate' ? 'SUSPENDED' : 'ACTIVE';
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: intern.user.id }, data: { status: to } });
      await this.audit.logWithin(tx, {
        action: AuditAction.INTERN_STATUS_CHANGED,
        actorId: ctx.userId,
        actorRole: 'LAWYER',
        entity: 'User',
        entityId: intern.user.id,
        metadata: { chamber: ctx.chamber.chamberCode, from, to },
        ...meta,
      });
    });
    return {
      message:
        dto.action === 'deactivate' ? 'Intern account deactivated.' : 'Intern account reactivated.',
    };
  }

  async detail(ctx: ChamberContext, id: string) {
    const intern = await this.internOrThrow(ctx, id);
    const [attendance, logs, entries] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { internId: id },
        orderBy: { date: 'desc' },
        take: 60,
        include: { court: { select: { name: true } } },
      }),
      this.prisma.internDiaryEntry.findMany({
        where: { internId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: researchLogSelect,
      }),
      this.prisma.internDiaryEntry.count({ where: { internId: id } }),
    ]);
    return {
      id: intern.id,
      name: `${intern.user.firstName} ${intern.user.lastName}`,
      email: intern.user.email,
      phone: intern.user.phone,
      status: intern.user.status,
      startDate: intern.startDate,
      entries,
      attendance: attendance.map((a) => ({
        id: a.id,
        date: isoDay(a.date),
        checkInAt: a.checkInAt,
        checkOutAt: a.checkOutAt,
        court: a.court?.name ?? null,
        verified: a.withinGeofence,
      })),
      recentLogs: logs.map(toLogItem),
    };
  }

  // ------------------------------------------------------------ research logs (knowledge base)

  async listLogs(ctx: ChamberContext, q: ResearchLogQueryDto) {
    const search = q.q;
    const where: Prisma.InternDiaryEntryWhereInput = {
      intern: { supervisorId: ctx.lawyerId },
      ...(q.internId ? { internId: q.internId } : {}),
      ...(q.status ? { reviewStatus: q.status } : {}),
      ...(search
        ? {
            OR: [
              { keywords: { has: search.toLowerCase() } },
              { citation: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
              { case: { ucn: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
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

  async review(ctx: ChamberContext, id: string, dto: ReviewLogDto, meta: RequestMeta) {
    const log = await this.prisma.internDiaryEntry.findFirst({
      where: { id, intern: { supervisorId: ctx.lawyerId } },
      select: {
        id: true,
        reviewStatus: true,
        case: { select: { ucn: true } },
        intern: { select: { userId: true } },
      },
    });
    if (!log) throw new NotFoundException(Messages.NOT_FOUND);
    if (log.reviewStatus !== 'SUBMITTED') {
      throw conflict('ALREADY_REVIEWED', 'This log has already been reviewed.');
    }
    await this.prisma.$transaction(async (tx) => {
      // Conditional update: two simultaneous reviews cannot both win.
      const done = await tx.internDiaryEntry.updateMany({
        where: { id, reviewStatus: 'SUBMITTED' },
        data: {
          reviewStatus: dto.status,
          reviewComment: dto.comment ?? null,
          reviewerId: ctx.userId,
          reviewedAt: new Date(),
        },
      });
      if (done.count !== 1)
        throw conflict('ALREADY_REVIEWED', 'This log has already been reviewed.');
      await this.notifications.notify(
        log.intern.userId,
        {
          type: 'RESEARCH_REVIEWED',
          title:
            dto.status === 'APPROVED' ? 'Research log approved' : 'Research log needs revision',
          body: `Your research log${log.case ? ` for ${log.case.ucn}` : ''} was ${dto.status === 'APPROVED' ? 'approved' : 'returned for revision'}${dto.comment ? `: ${dto.comment}` : '.'}`,
        },
        tx,
      );
      await this.audit.logWithin(tx, {
        action: AuditAction.RESEARCH_LOG_REVIEWED,
        actorId: ctx.userId,
        actorRole: 'LAWYER',
        entity: 'InternDiaryEntry',
        entityId: id,
        metadata: { chamber: ctx.chamber.chamberCode, status: dto.status },
        ...meta,
      });
    });
    return {
      message:
        dto.status === 'APPROVED'
          ? 'Research log approved.'
          : 'Research log returned for revision.',
    };
  }
}
