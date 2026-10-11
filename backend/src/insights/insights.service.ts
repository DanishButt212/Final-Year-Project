import { Injectable } from '@nestjs/common';
import { computeProgress, progressSelect, type ProgressStage } from '../cases/case-progress';
import { caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { pkIsoDate, pkParts, pkToday } from '../common/pk-time';
import { CaseType, HearingStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Results are cached per user for this long (dashboards poll; the numbers move slowly). */
export const INSIGHTS_TTL_MS = 60_000;
const DAY_MS = 86_400_000;

type Stage = ProgressStage | 'CLOSED';
const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM of a calendar date stored as UTC midnight (@db.Date). */
const dateMonth = (d: Date) => d.toISOString().slice(0, 7);
/** YYYY-MM of an instant, in Pakistan time. */
const instantMonth = (d: Date) => pkIsoDate(d).slice(0, 7);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The last `n` months in Pakistan time, oldest first, as YYYY-MM. */
function lastMonths(n: number, now = new Date()): string[] {
  const { year, month } = pkParts(now);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}
/** First day (UTC midnight) of a YYYY-MM month. */
const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00.000Z`);
/** The instant at which a YYYY-MM month starts in Pakistan. */
const monthStartInstant = (ym: string) => new Date(`${ym}-01T00:00:00+05:00`);

function countBy<T>(rows: T[], key: (r: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const average = (xs: number[]) =>
  xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

/**
 * Role-scoped aggregates for the dashboard charts. Every number is computed inside the caller's case scope
 * (common/case-access.ts), so a chart can never reveal another user's cases. Money stays Decimal and is sent
 * as a string with two decimals. Results are cached per user for 60 seconds.
 */
@Injectable()
export class InsightsService {
  private readonly cache = new Map<string, { at: number; data: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async forUser(user: AuthUser) {
    const key = `${user.id}:${user.role}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < INSIGHTS_TTL_MS) return hit.data;
    const data =
      user.role === 'ADMIN'
        ? await this.admin()
        : user.role === 'JUDGE'
          ? await this.judge(user)
          : await this.party(user);
    this.prune();
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  private prune() {
    const now = Date.now();
    for (const [k, v] of this.cache) if (now - v.at >= INSIGHTS_TTL_MS) this.cache.delete(k);
  }

  /** Litigants and lawyers: cases by stage, hearings in the next 30 days, fees paid this year. */
  private async party(user: AuthUser) {
    const scope = await caseScopeFor(this.prisma, user);
    const today = pkToday();
    const until = new Date(today.getTime() + 29 * DAY_MS);
    const { year } = pkParts();
    const [cases, hearings, payments, slotMinutes] = await Promise.all([
      this.prisma.case.findMany({
        where: { AND: [scope, { status: { not: 'DRAFT' } }] },
        select: progressSelect,
      }),
      this.prisma.hearing.findMany({
        where: {
          case: { AND: [scope, { status: { not: 'DRAFT' } }] },
          status: HearingStatus.SCHEDULED,
          date: { gte: today, lte: until },
        },
        select: { date: true },
      }),
      this.prisma.payment.findMany({
        where: {
          payerId: user.id,
          status: 'SUCCESS',
          paidAt: { gte: monthStartInstant(`${year}-01`) },
        },
        select: { amount: true, paidAt: true },
      }),
      this.settings.schedulePolicy().then((p) => p.hearingSlotMinutes),
    ]);

    // The stage in progress (Filed is always complete once a case is submitted), or DECIDED / CLOSED.
    const stages: Stage[] = ['FEE_PAID', 'ALLOCATED', 'HEARING', 'DECIDED', 'CLOSED'];
    const byStage = countBy(cases, (c) => {
      const p = computeProgress(c, slotMinutes);
      return p.terminal ? 'CLOSED' : (p.current ?? 'DECIDED');
    });
    const perDay = countBy(hearings, (h) => isoDay(h.date));
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
    const paid = new Map<string, Prisma.Decimal>();
    for (const p of payments) {
      const m = instantMonth(p.paidAt as Date);
      paid.set(m, (paid.get(m) ?? new Prisma.Decimal(0)).add(p.amount));
    }

    return {
      role: user.role,
      casesByStage: stages.map((stage) => ({ stage, count: byStage.get(stage) ?? 0 })),
      upcomingHearings: Array.from({ length: 30 }, (_, i) => {
        const date = isoDay(new Date(today.getTime() + i * DAY_MS));
        return { date, count: perDay.get(date) ?? 0 };
      }),
      paymentsThisYear: months.map((month) => ({
        month,
        amount: (paid.get(month) ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  /** Judges: hearings per day this week and next, outcomes this month, pending decisions, days to decision. */
  private async judge(user: AuthUser) {
    const today = pkToday();
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
    const end = new Date(monday.getTime() + 13 * DAY_MS);
    const thisMonth = instantMonth(new Date());
    const [hearings, outcomes, pending, decided] = await Promise.all([
      this.prisma.hearing.findMany({
        where: { judgeId: user.id, date: { gte: monday, lte: end }, status: { not: 'CANCELLED' } },
        select: { date: true },
      }),
      this.prisma.hearing.groupBy({
        by: ['status'],
        where: { judgeId: user.id, outcomeAt: { gte: monthStartInstant(thisMonth) } },
        _count: { _all: true },
      }),
      this.prisma.case.count({
        where: {
          judgeId: user.id,
          decidedAt: null,
          status: { in: ['ALLOCATED', 'PENDING', 'HEARING_FIXED'] },
        },
      }),
      this.prisma.case.findMany({
        where: { judgeId: user.id, decidedAt: { not: null } },
        select: {
          decidedAt: true,
          hearings: { select: { date: true }, orderBy: { date: 'asc' }, take: 1 },
        },
      }),
    ]);

    const perDay = countBy(hearings, (h) => isoDay(h.date));
    const outcomeCounts = new Map(outcomes.map((o) => [o.status, o._count._all]));
    const days = decided.flatMap((c) =>
      c.hearings[0] && c.decidedAt
        ? [Math.max(0, (pkToday(c.decidedAt).getTime() - c.hearings[0].date.getTime()) / DAY_MS)]
        : [],
    );

    return {
      role: user.role,
      hearingsPerDay: Array.from({ length: 14 }, (_, i) => {
        const date = isoDay(new Date(monday.getTime() + i * DAY_MS));
        return { date, count: perDay.get(date) ?? 0, week: i < 7 ? 'THIS' : 'NEXT' };
      }),
      outcomesThisMonth: (['HELD', 'ADJOURNED', 'CANCELLED'] as HearingStatus[]).map((status) => ({
        status,
        count: outcomeCounts.get(status) ?? 0,
      })),
      pendingDecisions: pending,
      averageDaysFirstHearingToDecision: average(days),
      decidedCount: days.length,
    };
  }

  /** Administrators: filings, disposal rate, categories, fee revenue, days to decision, busiest courtrooms. */
  private async admin() {
    const months = lastMonths(12);
    const from = monthStart(months[0]);
    const fromInstant = monthStartInstant(months[0]);
    const since90 = new Date(pkToday().getTime() - 89 * DAY_MS);
    const [filed, decided, byType, payments, busy] = await Promise.all([
      this.prisma.case.groupBy({
        by: ['filingDate'],
        where: { status: { not: 'DRAFT' }, filingDate: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.case.findMany({
        where: { decidedAt: { gte: fromInstant } },
        select: { decidedAt: true, filingDate: true },
      }),
      this.prisma.case.groupBy({
        by: ['caseType'],
        where: { status: { not: 'DRAFT' } },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', paidAt: { gte: fromInstant } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.hearing.groupBy({
        by: ['courtroomId'],
        where: { courtroomId: { not: null }, status: { not: 'CANCELLED' }, date: { gte: since90 } },
        _count: { _all: true },
        orderBy: { _count: { courtroomId: 'desc' } },
        take: 5,
      }),
    ]);

    const filedPerMonth = new Map<string, number>();
    for (const r of filed) {
      if (!r.filingDate) continue;
      const m = dateMonth(r.filingDate);
      filedPerMonth.set(m, (filedPerMonth.get(m) ?? 0) + r._count._all);
    }
    const decidedPerMonth = countBy(decided, (c) => instantMonth(c.decidedAt as Date));
    const revenue = new Map<string, Prisma.Decimal>();
    for (const p of payments) {
      const m = instantMonth(p.paidAt as Date);
      revenue.set(m, (revenue.get(m) ?? new Prisma.Decimal(0)).add(p.amount));
    }
    const rooms = await this.prisma.courtroom.findMany({
      where: { id: { in: busy.map((b) => b.courtroomId as string) } },
      select: { id: true, name: true, court: { select: { name: true } } },
    });
    const roomName = new Map(rooms.map((r) => [r.id, r]));
    const daysToDecision = decided.flatMap((c) =>
      c.filingDate && c.decidedAt
        ? [Math.max(0, (pkToday(c.decidedAt).getTime() - c.filingDate.getTime()) / DAY_MS)]
        : [],
    );
    const typeCounts = new Map(byType.map((t) => [t.caseType, t._count._all]));

    return {
      role: 'ADMIN' as const,
      filingsPerMonth: months.map((month) => ({ month, count: filedPerMonth.get(month) ?? 0 })),
      disposalRate: months.map((month) => {
        const f = filedPerMonth.get(month) ?? 0;
        const d = decidedPerMonth.get(month) ?? 0;
        return { month, filed: f, decided: d, rate: f ? round1((d / f) * 100) : null };
      }),
      casesByCategory: Object.values(CaseType).map((caseType) => ({
        caseType,
        count: typeCounts.get(caseType) ?? 0,
      })),
      feeRevenuePerMonth: months.map((month) => ({
        month,
        amount: (revenue.get(month) ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      averageDaysFilingToDecision: average(daysToDecision),
      decidedCount: daysToDecision.length,
      topCourtrooms: busy.map((b) => {
        const r = roomName.get(b.courtroomId as string);
        return {
          courtroomId: b.courtroomId,
          name: r?.name ?? '',
          court: r?.court.name ?? '',
          hearings: b._count._all,
        };
      }),
    };
  }
}
