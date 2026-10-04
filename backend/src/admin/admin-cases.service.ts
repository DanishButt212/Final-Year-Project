import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { CaseEventType, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { caseDetailInclude, toCaseDetail } from '../cases/cases.service';
import { AdminCourtsService } from './admin-courts.service';
import { fullName, personName, RequestMeta } from './constants';
import { AdminListCasesQueryDto, AllocateCaseDto } from './dto/admin.dto';

const listSelect = {
  id: true,
  ucn: true,
  title: true,
  caseType: true,
  status: true,
  filingDate: true,
  court: { select: { id: true, name: true } },
  courtroom: { select: { name: true } },
  judge: personName,
  filedBy: personName,
  challans: { select: { status: true }, orderBy: { issuedAt: 'desc' }, take: 1 },
} satisfies Prisma.CaseSelect;

const bad = (field: string, text: string) =>
  new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: Messages.INVALID_FIELDS,
    details: [{ field, messages: [text] }],
  });

/** Case registry and allocation to a court, bench and judge (the project's own design). */
@Injectable()
export class AdminCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly courts: AdminCourtsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: AdminListCasesQueryDto) {
    const where: Prisma.CaseWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.courtId ? { courtId: q.courtId } : {}),
      ...(q.caseType ? { caseType: q.caseType } : {}),
      ...(q.from || q.to
        ? {
            filingDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { ucn: { contains: q.search, mode: 'insensitive' } },
              { title: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.case.count({ where }),
      this.prisma.case.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      data: rows.map((c) => ({
        id: c.id,
        ucn: c.ucn,
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        filingDate: c.filingDate,
        court: c.court?.name ?? null,
        courtId: c.court?.id ?? null,
        courtroom: c.courtroom?.name ?? null,
        judge: c.judge ? fullName(c.judge) : null,
        filedBy: fullName(c.filedBy),
        feeStatus: c.challans[0]
          ? c.challans[0].status === 'PAID'
            ? 'PAID'
            : 'UNPAID'
          : 'NOT_GENERATED',
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async detail(id: string) {
    const c = await this.prisma.case.findUnique({ where: { id }, include: caseDetailInclude });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    return toCaseDetail(c);
  }

  async allocate(actor: AuthUser, caseId: string, dto: AllocateCaseDto, meta: RequestMeta) {
    const target = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, ucn: true, status: true, judgeId: true, filedById: true, title: true },
    });
    if (!target) throw new NotFoundException(Messages.NOT_FOUND);

    const isReallocation = target.status === 'ALLOCATED' && dto.reallocate === true;

    // Allocation gate: the court fee must be paid before a case enters the allocation queue.
    if (target.status === 'PENDING_ASSIGNMENT') {
      const paid = await this.prisma.challan.count({ where: { caseId, status: 'PAID' } });
      if (paid === 0) {
        throw new ConflictException({
          code: 'FEE_UNPAID',
          message: 'Court fee is unpaid for this case.',
        });
      }
    }
    if (target.status !== 'PENDING_ASSIGNMENT' && !isReallocation) {
      throw new ConflictException({
        code: 'NOT_ALLOCATABLE',
        message:
          target.status === 'ALLOCATED'
            ? 'This case is already allocated. Confirm re-allocation to move it to another judge.'
            : 'Only cases pending assignment can be allocated.',
      });
    }

    const court = await this.prisma.court.findFirst({
      where: { id: dto.courtId, isActive: true },
      select: { id: true, name: true },
    });
    if (!court) throw bad('courtId', 'Choose an active court.');

    const judge =
      dto.mode === 'MANUAL'
        ? await this.pickManual(dto, court.id)
        : await this.pickRandom(court.id, isReallocation ? target.judgeId : null);

    const courtroomId = await this.resolveCourtroom(dto.courtroomId, judge, court.id);
    const courtroom = courtroomId
      ? await this.prisma.courtroom.findUnique({
          where: { id: courtroomId },
          select: { id: true, name: true },
        })
      : null;
    const judgeName = fullName(judge);
    const previous =
      isReallocation && target.judgeId
        ? await this.prisma.user.findUnique({
            where: { id: target.judgeId },
            select: { firstName: true, lastName: true },
          })
        : null;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the status we read, so two registrars cannot allocate the same case twice.
      const done = await tx.case.updateMany({
        where: { id: caseId, status: target.status },
        data: {
          status: 'ALLOCATED',
          courtId: court.id,
          courtroomId,
          judgeId: judge.id,
          allocatedAt: now,
        },
      });
      if (done.count !== 1) {
        throw new ConflictException({
          code: 'NOT_ALLOCATABLE',
          message: 'This case was changed by someone else. Reload and try again.',
        });
      }
      await tx.caseEvent.create({
        data: {
          caseId,
          type: CaseEventType.CASE_ALLOCATED,
          description:
            `${isReallocation ? 'Case re-allocated' : 'Case allocated'} to ${judgeName}` +
            `, ${court.name}${courtroom ? `, ${courtroom.name}` : ''}` +
            (previous ? ` (previously ${fullName(previous)}).` : '.'),
          actorId: actor.id,
          createdAt: now,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.CASE_ALLOCATED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Case',
        entityId: caseId,
        metadata: {
          ucn: target.ucn,
          mode: dto.mode,
          courtId: court.id,
          courtroomId,
          judgeId: judge.id,
          previousJudgeId: isReallocation ? target.judgeId : null,
        },
        ...meta,
      });
      await this.notifications.notify(
        target.filedById,
        {
          type: 'CASE_ALLOCATED',
          title: 'Your case has been allocated',
          body: `${target.ucn} was allocated to ${judgeName} at ${court.name}${courtroom ? `, ${courtroom.name}` : ''}.`,
        },
        tx,
      );
    });

    return {
      message: `Case ${target.ucn} allocated to ${judgeName}.`,
      judge: { id: judge.id, name: judgeName },
      court: court.name,
      courtroom: courtroom?.name ?? null,
      previousJudge: previous ? fullName(previous) : null,
      mode: dto.mode,
    };
  }

  private async pickManual(dto: AllocateCaseDto, courtId: string) {
    if (!dto.judgeId) throw bad('judgeId', 'Choose a judge.');
    const judge = await this.prisma.user.findFirst({
      where: { id: dto.judgeId, role: 'JUDGE', status: 'ACTIVE', courtId },
      select: { id: true, firstName: true, lastName: true, courtroomId: true },
    });
    if (!judge) throw bad('judgeId', 'Choose an active judge of the selected court.');
    return judge;
  }

  /** Fewest active cases wins; ties are broken at random. The previous judge is skipped on re-allocation. */
  private async pickRandom(courtId: string, excludeJudgeId: string | null) {
    let judges = await this.prisma.user.findMany({
      where: { role: 'JUDGE', status: 'ACTIVE', courtId },
      select: { id: true, firstName: true, lastName: true, courtroomId: true },
    });
    if (excludeJudgeId && judges.some((j) => j.id !== excludeJudgeId)) {
      judges = judges.filter((j) => j.id !== excludeJudgeId);
    }
    if (judges.length === 0) {
      throw new ConflictException({
        code: 'NO_JUDGE_AVAILABLE',
        message: 'This court has no active judge to allocate to.',
      });
    }
    const load = await this.courts.caseloads(judges.map((j) => j.id));
    const lowest = Math.min(...judges.map((j) => load.get(j.id) ?? 0));
    const tied = judges.filter((j) => (load.get(j.id) ?? 0) === lowest);
    return tied[randomInt(tied.length)];
  }

  /** Given bench, else the judge's own courtroom, else the court's first active courtroom. */
  private async resolveCourtroom(
    requested: string | undefined,
    judge: { courtroomId: string | null },
    courtId: string,
  ): Promise<string | null> {
    if (requested) {
      const room = await this.prisma.courtroom.findFirst({
        where: { id: requested, courtId, isActive: true },
        select: { id: true },
      });
      if (!room) throw bad('courtroomId', 'Choose an active courtroom of the selected court.');
      return room.id;
    }
    if (judge.courtroomId) {
      const own = await this.prisma.courtroom.findFirst({
        where: { id: judge.courtroomId, courtId, isActive: true },
        select: { id: true },
      });
      if (own) return own.id;
    }
    const first = await this.prisma.courtroom.findFirst({
      where: { courtId, isActive: true },
      orderBy: [{ benchNo: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    return first?.id ?? null;
  }
}
