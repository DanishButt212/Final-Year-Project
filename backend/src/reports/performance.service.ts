import { BadRequestException, Injectable } from '@nestjs/common';
import { fullName } from '../admin/constants';
import { Messages } from '../common/messages';
import { CaseType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PerformanceQueryDto } from './reports.dto';

export interface Bucket {
  key: string;
  label: string;
  filed: number;
  decided: number;
  pending: number;
  disposalRatePercent: number | null;
  avgTrialDays: number | null;
}

export interface PerformanceReport {
  params: {
    year: number;
    monthFrom: number;
    monthTo: number;
    caseType: CaseType | null;
    judgeId: string | null;
    courtId: string | null;
    periodLabel: string;
    judgeLabel: string | null;
    courtLabel: string | null;
  };
  summary: {
    filed: number;
    decided: number;
    pending: number;
    disposalRatePercent: number | null;
    avgTrialDays: number | null;
    avgHearingsPerDecided: number | null;
  };
  monthly: { month: string; label: string; filed: number; decided: number }[];
  byCaseType: Bucket[];
  byJudge: Bucket[];
  byCourt: Bucket[];
}

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  CIVIL_SUIT: 'Civil Suit',
  CRIMINAL_APPEAL: 'Criminal Appeal',
  WRIT_PETITION: 'Writ Petition',
  BAIL_APPLICATION: 'Bail Application',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 24 * 3600 * 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const rate = (decided: number, filed: number) =>
  filed === 0 ? null : round1((decided / filed) * 100);
const avg = (xs: number[]) =>
  xs.length === 0 ? null : round1(xs.reduce((a, b) => a + b, 0) / xs.length);

interface Dims {
  caseType: CaseType;
  judgeId: string | null;
  courtId: string | null;
}

/** The engine behind "Judicial Performance & Statistical Engine": resolution ratios and trial cycle lengths. */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async compile(q: PerformanceQueryDto): Promise<PerformanceReport> {
    if (q.monthFrom > q.monthTo) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [
          { field: 'monthTo', messages: ['The last month must not be before the first month.'] },
        ],
      });
    }
    const start = new Date(Date.UTC(q.year, q.monthFrom - 1, 1));
    const end = new Date(Date.UTC(q.year, q.monthTo, 1));
    const base: Prisma.CaseWhereInput = {
      ...(q.caseType ? { caseType: q.caseType } : {}),
      ...(q.judgeId ? { judgeId: q.judgeId } : {}),
      ...(q.courtId ? { courtId: q.courtId } : {}),
    };
    const dims = { caseType: true, judgeId: true, courtId: true } as const;

    const [filed, decided, pending] = await Promise.all([
      this.prisma.case.findMany({
        where: { ...base, filingDate: { gte: start, lt: end } },
        select: { ...dims, filingDate: true },
      }),
      this.prisma.case.findMany({
        where: { ...base, decidedAt: { gte: start, lt: end } },
        select: {
          ...dims,
          filingDate: true,
          decidedAt: true,
          _count: { select: { hearings: { where: { status: { not: 'CANCELLED' } } } } },
        },
      }),
      this.prisma.case.findMany({
        where: {
          ...base,
          filingDate: { not: null, lt: end },
          status: { notIn: ['DRAFT', 'REJECTED'] },
          OR: [{ decidedAt: null }, { decidedAt: { gte: end } }],
        },
        select: dims,
      }),
    ]);

    const days = (r: { filingDate: Date | null; decidedAt: Date | null }) =>
      r.filingDate && r.decidedAt
        ? Math.max(0, (r.decidedAt.getTime() - r.filingDate.getTime()) / DAY)
        : null;
    const durations = decided.map(days).filter((n): n is number => n !== null);
    const hearings = decided.map((d) => d._count.hearings);

    const monthly: PerformanceReport['monthly'] = [];
    for (let m = q.monthFrom; m <= q.monthTo; m++) {
      const inMonth = (d: Date | null) =>
        d !== null && d.getUTCFullYear() === q.year && d.getUTCMonth() === m - 1;
      monthly.push({
        month: `${q.year}-${String(m).padStart(2, '0')}`,
        label: `${MONTHS[m - 1]} ${q.year}`,
        filed: filed.filter((r) => inMonth(r.filingDate)).length,
        decided: decided.filter((r) => inMonth(r.decidedAt)).length,
      });
    }

    const [judges, courts] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'JUDGE' },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.court.findMany({ select: { id: true, name: true } }),
    ]);
    const judgeName = new Map(judges.map((j) => [j.id, fullName(j)]));
    const courtName = new Map(courts.map((c) => [c.id, c.name]));

    const buckets = (
      key: (d: Dims) => string | null,
      label: (k: string | null) => string,
    ): Bucket[] => {
      const keys = new Set<string | null>();
      for (const r of [...filed, ...decided, ...pending]) keys.add(key(r));
      const out = [...keys].map((k) => {
        const f = filed.filter((r) => key(r) === k).length;
        const dec = decided.filter((r) => key(r) === k);
        const p = pending.filter((r) => key(r) === k).length;
        return {
          key: k ?? 'none',
          label: label(k),
          filed: f,
          decided: dec.length,
          pending: p,
          disposalRatePercent: rate(dec.length, f),
          avgTrialDays: avg(dec.map(days).filter((n): n is number => n !== null)),
        };
      });
      return out.sort((a, b) => a.label.localeCompare(b.label));
    };

    return {
      params: {
        year: q.year,
        monthFrom: q.monthFrom,
        monthTo: q.monthTo,
        caseType: q.caseType ?? null,
        judgeId: q.judgeId ?? null,
        courtId: q.courtId ?? null,
        periodLabel: `${MONTHS[q.monthFrom - 1]} to ${MONTHS[q.monthTo - 1]} ${q.year}`,
        judgeLabel: q.judgeId ? (judgeName.get(q.judgeId) ?? null) : null,
        courtLabel: q.courtId ? (courtName.get(q.courtId) ?? null) : null,
      },
      summary: {
        filed: filed.length,
        decided: decided.length,
        pending: pending.length,
        disposalRatePercent: rate(decided.length, filed.length),
        avgTrialDays: avg(durations),
        avgHearingsPerDecided: avg(hearings),
      },
      monthly,
      byCaseType: buckets(
        (d) => d.caseType,
        (k) => (k ? CASE_TYPE_LABEL[k as CaseType] : 'Unknown'),
      ),
      byJudge: buckets(
        (d) => d.judgeId,
        (k) => (k ? (judgeName.get(k) ?? 'Unknown judge') : 'Not yet allocated'),
      ),
      byCourt: buckets(
        (d) => d.courtId,
        (k) => (k ? (courtName.get(k) ?? 'Unknown court') : 'Not yet allocated'),
      ),
    };
  }

  /** Dropdown values for the filter form. */
  async options() {
    const [judges, courts] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'JUDGE', status: { not: 'DEACTIVATED' } },
        select: { id: true, firstName: true, lastName: true, courtId: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.court.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      judges: judges.map((j) => ({ id: j.id, name: fullName(j), courtId: j.courtId })),
      courts,
      caseTypes: Object.entries(CASE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    };
  }
}
