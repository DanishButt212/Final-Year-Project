import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { pkToday } from '../common/pk-time';
import { HearingCoverageStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dayLockKey } from '../scheduling/slots';


const person = { select: { firstName: true, lastName: true } } as const;
const profileDetails = { user: person } as const;
const hearingInclude = {
  courtroom: { select: { name: true, courtId: true } },
  case: {
    select: {
      id: true,
      ucn: true,
      title: true,
      parties: {
        where: { lawyerId: { not: null } },
        select: { lawyerId: true, lawyer: { include: profileDetails } },
      },
    },
  },
} satisfies Prisma.HearingInclude;
const requestInclude = {
  hearing: { include: hearingInclude },
  original: { include: profileDetails },
  substitute: { include: profileDetails },
} satisfies Prisma.HearingCoverageInclude;
type HearingRow = Prisma.HearingGetPayload<{ include: typeof hearingInclude }>;
type RequestRow = Prisma.HearingCoverageGetPayload<{ include: typeof requestInclude }>;
type Db = Prisma.TransactionClient;
type Action =
  | 'NOMINATE'
  | 'ALLOCATE'
  | 'ACCEPT'
  | 'DECLINE'
  | 'READER_APPROVE'
  | 'READER_REJECT'
  | 'JUDGE_APPROVE'
  | 'JUDGE_REJECT';
const pending: HearingCoverageStatus[] = [
  'NEEDS_NOMINEE',
  'CHAMBER_PENDING',
  'NOMINEE_PENDING',
  'READER_PENDING',
  'JUDGE_PENDING',
  'APPROVED',
];
const staffQueue: HearingCoverageStatus[] = [
  'READER_PENDING',
  'JUDGE_PENDING',
  'APPROVED',
  'REJECTED',
  'RESCHEDULE_REQUIRED',
  'RESCHEDULED',
  'SUPERSEDED',
];
const day = (value: Date) => value.toISOString().slice(0, 10);
const displayName = (p: { user: { firstName: string; lastName: string } }) =>
  `${p.user.firstName} ${p.user.lastName}`;

@Injectable()
export class CoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async lawyer(db: Db, user: AuthUser) {
    const p = await db.lawyerProfile.findFirst({
      where: { userId: user.id, verificationStatus: 'VERIFIED', user: { status: 'ACTIVE' } },
      include: { chamber: true, chamberMembership: { include: { chamber: true } } },
    });
    if (!p) throw new NotFoundException('An active verified lawyer account is required.');
    const chambers = [p.chamber, p.chamberMembership?.chamber].filter(
      (c) => c?.licenseStatus === 'ACTIVE',
    );
    return { ...p, chambers };
  }

  private async hearing(db: Db, id: string) {
    const h = await db.hearing.findUnique({ where: { id }, include: hearingInclude });
    if (!h) throw new NotFoundException();
    return h;
  }

  private isCounsel(h: HearingRow, id: string) {
    return h.case.parties.some((party) => party.lawyerId === id);
  }

  private async onHearing<T>(id: string, fn: (tx: Db, hearing: HearingRow) => Promise<T>) {
    const pre = await this.hearing(this.prisma, id);
    return this.prisma.$transaction(async (tx) => {
      // Share the scheduling board's lock so an approval and a conflicting booking cannot both commit.
      const key = dayLockKey(pre.date);
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(${key}::bigint)) AS l`;
      await tx.$queryRaw`SELECT id FROM "Hearing" WHERE id = ${id} FOR UPDATE`;
      const current = await this.hearing(tx, id);
      if (current.date.getTime() !== pre.date.getTime())
        throw new ConflictException('The hearing date changed. Refresh and try again.');
      return fn(tx, current);
    });
  }

  private hearingView(h: HearingRow) {
    return {
      id: h.id,
      caseId: h.case.id,
      ucn: h.case.ucn,
      title: h.case.title,
      date: day(h.date),
      time: h.startTime,
      courtId: h.courtroom?.courtId ?? null,
      courtroom: h.courtroom?.name ?? null,
      status: h.status,
      lastSummons: h.lastSummons,
    };
  }

  private view(r: RequestRow, chamber = false) {
    const h = this.hearingView(r.hearing);
    const minimal = { id: h.id, date: h.date, time: h.time, courtroom: h.courtroom };
    return {
      id: r.id,
      hearing: chamber ? minimal : h,
      original: displayName(r.original),
      substitute: r.substitute ? displayName(r.substitute) : null,
      status: r.status,
      hearingDate: day(r.hearingDate),
      chamberId: r.chamberId,
      reason: chamber ? undefined : r.reason,
      decisionNote: chamber ? undefined : r.decisionNote,
      readerAt: r.readerAt,
      judgeAt: r.judgeAt,
    };
  }

  async context(user: AuthUser, hearingId: string) {
    const h = await this.hearing(this.prisma, hearingId);
    if (user.role === 'JUDGE' && h.judgeId !== user.id) throw new NotFoundException();
    if (user.role === 'LAWYER') {
      const p = await this.lawyer(this.prisma, user);
      if (!this.isCounsel(h, p.id)) throw new NotFoundException();
      return {
        hearing: this.hearingView(h),
        chambers: p.chambers.map((c) => ({ id: c!.id, name: c!.name })),
      };
    }
    const covered =
      user.role === 'JUDGE'
        ? await this.prisma.hearingCoverage.findMany({
            where: {
              hearingId,
              hearingDate: h.date,
              hearingSlot: h.timeSlot,
              status: 'APPROVED',
              hearing: { lastSummons: false },
            },
            select: { substitute: { include: profileDetails } },
          })
        : [];
    const lawyers = h.case.parties
      .flatMap((p) => (p.lawyer ? [p.lawyer] : []))
      .concat(covered.flatMap((p) => (p.substitute ? [p.substitute] : [])));
    return {
      hearing: this.hearingView(h),
      counsel: [
        ...new Map(
          lawyers.map((lawyer) => [lawyer.id, { id: lawyer.id, name: displayName(lawyer) }]),
        ).values(),
      ],
    };
  }

  async dashboard(user: AuthUser, chamber: boolean) {
    let where: Prisma.HearingCoverageWhereInput;
    let invitations: Prisma.HearingCoverageWhereInput | undefined;
    let chambers: { id: string; name: string; manager: boolean }[] = [];
    if (user.role === 'LAWYER') {
      const p = await this.lawyer(this.prisma, user);
      chambers = p.chambers.map((c) => ({
        id: c!.id,
        name: c!.name,
        manager: c!.lawyerId === p.id,
      }));
      where = chamber ? { chamberId: { in: chambers.map((c) => c.id) } } : { originalId: p.id };
      if (!chamber)
        invitations = {
          substituteId: p.id,
          status: { in: ['NOMINEE_PENDING', 'READER_PENDING', 'JUDGE_PENDING', 'APPROVED'] },
        };
    } else {
      where =
        user.role === 'JUDGE'
          ? {
              hearing: { judgeId: user.id },
              OR: [{ status: 'JUDGE_PENDING' }, { judgeAt: { not: null } }],
            }
          : { status: { in: staffQueue } };
    }
    const rows = await this.prisma.hearingCoverage.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const incoming = invitations
      ? await this.prisma.hearingCoverage.findMany({
          where: invitations,
          include: requestInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : [];
    return {
      chambers,
      requests: rows.map((r) => this.view(r, chamber)),
      incoming: incoming.map((r) => {
        const accessToday =
          r.status === 'APPROVED' &&
          day(r.hearingDate) === day(pkToday()) &&
          day(r.hearingDate) === day(r.hearing.date) &&
          r.hearingSlot === r.hearing.timeSlot &&
          !r.hearing.lastSummons &&
          r.hearing.status !== 'CANCELLED';
        return { ...this.view(r, !accessToday), accessToday };
      }),
    };
  }

  async report(user: AuthUser, hearingId: string, reason: string, chamberId?: string) {
    return this.onHearing(hearingId, async (tx, h) => {
      const p = await this.lawyer(tx, user);
      if (!this.isCounsel(h, p.id)) throw new NotFoundException();
      this.checkOpen(h);
      if (!h.lastSummons && chamberId && !p.chambers.some((c) => c?.id === chamberId))
        throw new NotFoundException();
      const existing = await tx.hearingCoverage.findFirst({
        where: { hearingId, originalId: p.id, hearingDate: h.date, hearingSlot: h.timeSlot },
      });
      if (existing)
        throw new ConflictException('A clash request already exists for this hearing slot.');
      const r = await tx.hearingCoverage.create({
        data: {
          hearingId,
          originalId: p.id,
          hearingDate: h.date,
          hearingSlot: h.timeSlot,
          reason,
          chamberId: h.lastSummons ? null : chamberId,
          status: h.lastSummons
            ? 'RESCHEDULE_REQUIRED'
            : chamberId
              ? 'CHAMBER_PENDING'
              : 'NEEDS_NOMINEE',
        },
        include: requestInclude,
      });
      await this.log(tx, user, 'HEARING_CLASH_REPORTED', r.id);
      return this.view(r);
    });
  }

  private checkOpen(h: HearingRow) {
    if (!['SCHEDULED', 'ADJOURNED'].includes(h.status) || h.date < pkToday()) {
      throw new ConflictException('This hearing is closed for substitution requests.');
    }
  }

  private async available(
    db: Db,
    h: HearingRow,
    candidateId: string,
    originalId: string,
    chamberId?: string | null,
  ) {
    if (candidateId === originalId || this.isCounsel(h, candidateId))
      throw new BadRequestException(
        'Choose another lawyer who is not already assigned to this case.',
      );
    const candidate = await db.lawyerProfile.findFirst({
      where: {
        id: candidateId,
        verificationStatus: 'VERIFIED',
        user: { status: 'ACTIVE' },
        ...(chamberId
          ? { OR: [{ chamberMembership: { chamberId } }, { chamber: { id: chamberId } }] }
          : {}),
      },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('The selected lawyer is not eligible.');
    const clash = await db.hearing.findFirst({
      where: {
        date: h.date,
        timeSlot: h.timeSlot,
        status: { not: 'CANCELLED' },
        OR: [
          { case: { parties: { some: { lawyerId: candidateId } } } },
          {
            lastSummons: false,
            coverageRequests: {
              some: {
                substituteId: candidateId,
                status: 'APPROVED',
                hearingDate: h.date,
                hearingSlot: h.timeSlot,
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException('The selected lawyer already has a hearing in this slot.');
  }

  private async request(id: string) {
    const r = await this.prisma.hearingCoverage.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  async candidates(user: AuthUser, requestId: string, search: string) {
    const r = await this.request(requestId);
    const p = await this.lawyer(this.prisma, user);
    const chamberId = r.chamberId;
    const allowed = chamberId
      ? r.status === 'CHAMBER_PENDING' &&
        p.chamber?.id === chamberId &&
        p.chamber.licenseStatus === 'ACTIVE'
      : r.status === 'NEEDS_NOMINEE' && r.originalId === p.id;
    if (!allowed || r.hearing.lastSummons) throw new NotFoundException();
    const people = await this.prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        user: { status: 'ACTIVE' },
        AND: [
          ...(chamberId
            ? [{ OR: [{ chamberMembership: { chamberId } }, { chamber: { id: chamberId } }] }]
            : []),
          ...(search
            ? [
                {
                  OR: [
                    { barNumber: { contains: search, mode: 'insensitive' as const } },
                    { user: { firstName: { contains: search, mode: 'insensitive' as const } } },
                    { user: { lastName: { contains: search, mode: 'insensitive' as const } } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ user: { firstName: 'asc' } }, { id: 'asc' }],
      take: 50,
      select: { id: true, barNumber: true, user: person },
    });
    const available = [];
    for (const candidate of people) {
      try {
        await this.available(this.prisma, r.hearing, candidate.id, r.originalId, chamberId);
        available.push({
          id: candidate.id,
          name: displayName(candidate),
          barNumber: candidate.barNumber,
        });
      } catch (error) {
        if (!(
          error instanceof BadRequestException ||
          error instanceof ConflictException ||
          error instanceof NotFoundException
        ))
          throw error;
      }
    }
    return available;
  }

  async act(user: AuthUser, id: string, action: Action, candidateId?: string, note?: string) {
    const initial = await this.request(id);
    return this.onHearing(initial.hearingId, async (tx, h) => {
      const r = await tx.hearingCoverage.findUniqueOrThrow({
        where: { id },
        include: requestInclude,
      });
      const p = user.role === 'LAWYER' ? await this.lawyer(tx, user) : null;
      const state: Record<Action, [boolean, HearingCoverageStatus, HearingCoverageStatus]> = {
        NOMINATE: [p?.id === r.originalId && !r.chamberId, 'NEEDS_NOMINEE', 'NOMINEE_PENDING'],
        ALLOCATE: [
          Boolean(
            r.chamberId && p?.chamber?.id === r.chamberId && p.chamber.licenseStatus === 'ACTIVE',
          ),
          'CHAMBER_PENDING',
          'READER_PENDING',
        ],
        ACCEPT: [
          Boolean(p && p.id === r.substituteId && !r.chamberId),
          'NOMINEE_PENDING',
          'READER_PENDING',
        ],
        DECLINE: [
          Boolean(p && p.id === r.substituteId && !r.chamberId),
          'NOMINEE_PENDING',
          'NEEDS_NOMINEE',
        ],
        READER_APPROVE: [user.role === 'ADMIN', 'READER_PENDING', 'JUDGE_PENDING'],
        READER_REJECT: [user.role === 'ADMIN', 'READER_PENDING', 'REJECTED'],
        JUDGE_APPROVE: [
          user.role === 'JUDGE' && h.judgeId === user.id,
          'JUDGE_PENDING',
          'APPROVED',
        ],
        JUDGE_REJECT: [user.role === 'JUDGE' && h.judgeId === user.id, 'JUDGE_PENDING', 'REJECTED'],
      };
      const [authorized, expected, next] = state[action];
      if (!authorized) throw new NotFoundException();
      if (h.lastSummons)
        throw new ConflictException(
          'A last-summons hearing must be rescheduled through Bench Scheduling.',
        );
      this.checkOpen(h);
      if (
        r.status !== expected ||
        day(r.hearingDate) !== day(h.date) ||
        r.hearingSlot !== h.timeSlot
      ) {
        throw new ConflictException('The request has changed. Refresh and try again.');
      }
      if (next === 'REJECTED' && !note)
        throw new BadRequestException('Enter the rejection reason.');
      const nomination = action === 'NOMINATE' || action === 'ALLOCATE';
      const substituteId = nomination ? candidateId : r.substituteId;
      if (nomination || ['ACCEPT', 'JUDGE_APPROVE'].includes(action)) {
        if (!substituteId) throw new BadRequestException('Choose a substitute lawyer.');
        if (action === 'JUDGE_APPROVE' && (!r.readerAt || !this.isCounsel(h, r.originalId))) {
          throw new ConflictException(
            'Reader approval and the original case assignment are required.',
          );
        }
        await this.available(tx, h, substituteId, r.originalId, r.chamberId);
      }
      await tx.hearingCoverage.update({
        where: { id },
        data: {
          status: next,
          decisionNote: action === 'DECLINE' ? note || 'The nominee declined.' : (note ?? null),
          ...(nomination ? { substituteId } : action === 'DECLINE' ? { substituteId: null } : {}),
          ...(user.role === 'ADMIN' ? { readerId: user.id, readerAt: new Date() } : {}),
          ...(user.role === 'JUDGE' ? { judgeId: user.id, judgeAt: new Date() } : {}),
        },
      });
      await this.log(tx, user, `HEARING_COVERAGE_${action}`, id, {
        substituteId: substituteId ?? null,
        note: note ?? null,
      });
    });
  }

  async lastSummons(user: AuthUser, hearingId: string, marked: boolean) {
    await this.onHearing(hearingId, async (tx, h) => {
      if (!['SCHEDULED', 'ADJOURNED'].includes(h.status))
        throw new ConflictException('This hearing is closed.');
      await tx.hearing.update({ where: { id: hearingId }, data: { lastSummons: marked } });
      if (marked) {
        await tx.hearingCoverage.updateMany({
          where: { hearingId, status: { in: pending } },
          data: {
            status: 'RESCHEDULE_REQUIRED',
            decisionNote: 'Last summons. The Reader must assign a new hearing date.',
          },
        });
      }
      await this.log(tx, user, 'HEARING_LAST_SUMMONS_CHANGED', hearingId, { marked });
    });
  }

  async member(user: AuthUser, barNumber: string) {
    const p = await this.lawyer(this.prisma, user);
    if (p.chamber?.licenseStatus !== 'ACTIVE')
      throw new NotFoundException('Set up an active chamber first.');
    const chamberId = p.chamber.id;
    await this.prisma.$transaction(async (tx) => {
      const lawyer = await tx.lawyerProfile.findFirst({
        where: {
          barNumber: { equals: barNumber, mode: 'insensitive' },
          verificationStatus: 'VERIFIED',
          user: { status: 'ACTIVE' },
        },
      });
      if (!lawyer || lawyer.id === p.id)
        throw new NotFoundException('Choose another active verified lawyer.');
      const membership = await tx.chamberMembership.findUnique({ where: { lawyerId: lawyer.id } });
      if (membership?.chamberId === chamberId) return;
      if (membership)
        throw new ConflictException('This lawyer already belongs to another chamber.');
      await tx.chamberMembership.create({ data: { lawyerId: lawyer.id, chamberId } });
      await this.log(tx, user, 'CHAMBER_MEMBER_ADDED', chamberId, { lawyerId: lawyer.id });
    });
  }

  async absences(user: AuthUser, hearingId?: string, caseId?: string) {
    const rows = await this.prisma.hearingAbsence.findMany({
      where:
        user.role === 'JUDGE'
          ? { hearingId, hearing: { judgeId: user.id, caseId } }
          : { hearingId, hearing: { caseId }, fineRequired: true, assignedReaderId: user.id },
      include: { hearing: { include: hearingInclude }, lawyer: { include: profileDetails } },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      hearing: this.hearingView(r.hearing),
      hearingDate: day(r.hearingDate),
      lawyer: displayName(r.lawyer),
      fineRequired: r.fineRequired,
      status: r.fineRequired === null ? 'PENDING_DECISION'
        : !r.fineRequired ? 'NO_FINE'
        : r.fineAmount === null ? 'AWAITING_FINE_AMOUNT' : 'FINE_RECORDED',
      amount: r.fineAmount?.toFixed(2) ?? null,
      reason: r.reason,
    }));
  }

  async absence(
    user: AuthUser,
    hearingId: string,
    lawyerId: string,
    reason: string,
  ) {
    await this.onHearing(hearingId, async (tx, h) => {
      if (h.judgeId !== user.id) throw new NotFoundException();
      if (h.date > pkToday() || h.status === 'CANCELLED')
        throw new ConflictException('Absence can only be recorded on or after a hearing.');
      if (!this.isCounsel(h, lawyerId)) {
        const cover = await tx.hearingCoverage.findFirst({
          where: {
            hearingId,
            substituteId: lawyerId,
            status: 'APPROVED',
            hearingDate: h.date,
            hearingSlot: h.timeSlot,
            hearing: { lastSummons: false },
          },
        });
        if (!cover) throw new NotFoundException();
      }
      const existing = await tx.hearingAbsence.findFirst({
        where: { hearingId, lawyerId, hearingDate: h.date },
      });
      if (existing)
        throw new ConflictException(
          'An absence is already recorded for this lawyer and hearing.',
        );
      const a = await tx.hearingAbsence.create({
        data: { hearingId, lawyerId, hearingDate: h.date, judgeId: user.id, reason },
      });
      await this.log(tx, user, 'LAWYER_ABSENCE_RECORDED', a.id);
    });
  }

  async decideFine(user: AuthUser, absenceId: string, fineRequired: boolean) {
    const absence = await this.prisma.hearingAbsence.findUnique({
      where: { id: absenceId }, select: { hearingId: true, hearingDate: true, lawyer: { include: profileDetails } },
    });
    if (!absence) throw new NotFoundException();
    await this.onHearing(absence.hearingId, async (tx, h) => {
      if (h.judgeId !== user.id) throw new NotFoundException();
      let assignedReaderId: string | null = null;
      if (fineRequired) {
        const reader = h.readerId ? await tx.user.findFirst({
          where: { id: h.readerId, role: 'ADMIN', status: 'ACTIVE' }, select: { id: true },
        }) : null;
        if (!reader) throw new ConflictException('The hearing needs an active assigned Reader before a fine can be imposed.');
        assignedReaderId = reader.id;
      }
      const saved = await tx.hearingAbsence.updateMany({
        where: { id: absenceId, fineRequired: null },
        data: { fineRequired, assignedReaderId, decidedAt: new Date(), judgeId: user.id },
      });
      if (!saved.count) throw new ConflictException('The fine decision is already recorded.');
      await this.log(tx, user, 'LAWYER_FINE_DECIDED', absenceId, { fineRequired, assignedReaderId });
      if (assignedReaderId) await tx.notification.create({
        data: {
          userId: assignedReaderId, type: 'LAWYER_FINE_AMOUNT_REQUIRED', channel: 'IN_APP', sentAt: new Date(),
          title: 'Awaiting Fine Amount',
          body: `${displayName(absence.lawyer)} · ${h.case.ucn} · ${day(absence.hearingDate)}`,
        },
      });
    });
  }

  async fine(user: AuthUser, absenceId: string, amount: string) {
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.hearingAbsence.updateMany({
        where: { id: absenceId, fineRequired: true, fineAmount: null, assignedReaderId: user.id },
        data: { fineAmount: amount, readerId: user.id, finedAt: new Date() },
      });
      if (!count.count) throw new ConflictException('This absence has no pending fine.');
      await this.log(tx, user, 'LAWYER_FINE_RECORDED', absenceId, { amount });
    });
  }

  private log(
    tx: Db,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.logWithin(tx, {
      actorId: user.id,
      actorRole: user.role,
      action,
      entity: 'HearingCoverage',
      entityId,
      metadata,
    });
  }
}
