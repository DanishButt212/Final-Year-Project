import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/decorators';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { TrimOrUndefined } from '../common/validators';
import { DecisionType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isoDate } from '../scheduling/slots';

export const ORDER_OUTCOMES = [
  'COMPLETED',
  'ADJOURNED',
  'JUDGMENT',
  'DISMISSED',
  'DISPOSED',
] as const;
export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];

export class JudgeOrdersQueryDto extends PageQueryDto {
  /** UCN, case title or party name. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ORDER_OUTCOMES, {
    message: 'Outcome must be COMPLETED, ADJOURNED, JUDGMENT, DISMISSED or DISPOSED.',
  })
  outcome?: OrderOutcome;
}

/** Hard cap per source; a judge's record is small enough to merge and page in memory. */
const MAX_ROWS = 1000;

const caseSelect = {
  id: true,
  ucn: true,
  title: true,
  parties: { select: { name: true, role: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.CaseSelect;

type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

const partiesOf = (c: CaseRow) => c.parties.map((p) => p.name);

/** Orders and decisions the logged-in judge has recorded (hearing outcomes and final decisions). */
@Injectable()
export class JudgeOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(judge: AuthUser, q: JudgeOrdersQueryDto) {
    const search: Prisma.CaseWhereInput | undefined = q.search
      ? {
          OR: [
            { ucn: { contains: q.search, mode: 'insensitive' } },
            { title: { contains: q.search, mode: 'insensitive' } },
            { parties: { some: { name: { contains: q.search, mode: 'insensitive' } } } },
          ],
        }
      : undefined;
    const wantOutcomes = !q.outcome || q.outcome === 'COMPLETED' || q.outcome === 'ADJOURNED';
    const wantDecisions = !q.outcome || !wantOutcomes;

    const [hearings, decided] = await Promise.all([
      wantOutcomes
        ? this.prisma.hearing.findMany({
            where: {
              outcomeAt: { not: null },
              case: { judgeId: judge.id, ...search },
              ...(q.outcome === 'COMPLETED'
                ? { status: 'HELD' }
                : q.outcome === 'ADJOURNED'
                  ? { status: 'ADJOURNED' }
                  : { status: { in: ['HELD', 'ADJOURNED'] } }),
            },
            select: {
              id: true,
              date: true,
              startTime: true,
              status: true,
              orderSummary: true,
              outcomeAt: true,
              case: { select: caseSelect },
            },
            orderBy: { outcomeAt: 'desc' },
            take: MAX_ROWS,
          })
        : [],
      wantDecisions
        ? this.prisma.case.findMany({
            where: {
              judgeId: judge.id,
              decidedAt: { not: null },
              decisionType: q.outcome && !wantOutcomes ? (q.outcome as DecisionType) : { not: null },
              ...search,
            },
            select: {
              ...caseSelect,
              decidedAt: true,
              decisionType: true,
              decisionText: true,
              hearings: {
                where: { status: { not: 'CANCELLED' } },
                select: { date: true },
                orderBy: { date: 'desc' },
                take: 1,
              },
            },
            orderBy: { decidedAt: 'desc' },
            take: MAX_ROWS,
          })
        : [],
    ]);

    const rows = [
      ...hearings.map((h) => ({
        id: `H-${h.id}`,
        kind: 'HEARING_OUTCOME' as const,
        outcome: (h.status === 'ADJOURNED' ? 'ADJOURNED' : 'COMPLETED') as OrderOutcome,
        caseId: h.case.id,
        ucn: h.case.ucn,
        title: h.case.title,
        parties: partiesOf(h.case),
        hearingDate: isoDate(h.date),
        hearingTime: h.startTime,
        summary: h.orderSummary,
        recordedAt: h.outcomeAt as Date,
      })),
      ...decided.map((c) => ({
        id: `D-${c.id}`,
        kind: 'DECISION' as const,
        outcome: c.decisionType as OrderOutcome,
        caseId: c.id,
        ucn: c.ucn,
        title: c.title,
        parties: partiesOf(c),
        hearingDate: c.hearings[0] ? isoDate(c.hearings[0].date) : null,
        hearingTime: null,
        summary: c.decisionText,
        recordedAt: c.decidedAt as Date,
      })),
    ].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || a.id.localeCompare(b.id));

    const start = (q.page - 1) * q.limit;
    return {
      data: rows.slice(start, start + q.limit),
      meta: pageMeta(q.page, q.limit, rows.length),
    };
  }
}
