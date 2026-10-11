import { msg } from '@/i18n';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChartCard, StatCard } from '@/components/charts/ChartCard';
import type { ChartRow } from '@/components/charts/chart-types';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { caseTypeLabel } from '@/lib/case-status';
import { dayShort, monthLong, monthShort, weekdayLong } from '@/lib/chart-format';
import { formatDate, formatPkr } from '@/lib/format';
import {
  INSIGHTS_KEY,
  insightsApi,
  type AdminInsights,
  type Insights,
  type InsightStage,
  type JudgeInsights,
  type PartyInsights,
} from '@/lib/insights-api';

const STAGE_CHART_LABEL: Record<InsightStage, string> = {
  FEE_PAID: msg('Awaiting fee'),
  ALLOCATED: msg('Awaiting allocation'),
  HEARING: msg('In hearings'),
  DECIDED: msg('Decided'),
  CLOSED: msg('Closed'),
};
const OUTCOME_LABEL = {
  HELD: msg('Held'),
  ADJOURNED: msg('Adjourned'),
  CANCELLED: msg('Cancelled'),
} as const;

const CHART = (n: 1 | 2 | 3 | 4 | 5) => `var(--color-chart-${n})`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const largest = <T,>(rows: T[], value: (r: T) => number) =>
  rows.reduce<T | null>((best, r) => (!best || value(r) > value(best) ? r : best), null);

function useInsights<T extends Insights>(role: T['role'][]) {
  return useQuery({
    queryKey: INSIGHTS_KEY,
    queryFn: insightsApi.get,
    staleTime: 60_000,
    select: (d) => (role.includes(d.role) ? (d as T) : null),
  });
}

function Loading({ cards }: { cards: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('Loading charts')} className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-80" />
      ))}
      <span className="sr-only">{t('Loading…')}</span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="insights-heading" className="mb-6 space-y-4" data-tour="insights">
      <h2 id="insights-heading" className="text-xl font-bold">
        {t('At a glance')}
      </h2>
      {children}
    </section>
  );
}

/** Litigant and lawyer dashboards: cases by stage, hearings in the next 30 days, fees paid this year. */
export function PartyInsightsPanel() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useInsights<PartyInsights>(['LITIGANT', 'LAWYER']);
  if (isError) return <QueryError error={error} className="mb-6" />;
  if (isPending) return <Loading cards={3} />;
  if (!data) return null;

  const stageRows: ChartRow[] = data.casesByStage.map((s, i) => ({
    key: s.stage,
    label: t(STAGE_CHART_LABEL[s.stage]),
    full: t(STAGE_CHART_LABEL[s.stage]),
    value: s.count,
    display: String(s.count),
    color: CHART(([1, 2, 3, 4, 5] as const)[i]),
  }));
  const totalCases = sum(data.casesByStage.map((s) => s.count));
  const top = largest(data.casesByStage, (s) => s.count);

  const hearingRows: ChartRow[] = data.upcomingHearings.map((h) => ({
    key: h.date,
    label: dayShort(h.date),
    full: `${weekdayLong(h.date)} ${formatDate(h.date)}`,
    value: h.count,
    display: String(h.count),
  }));
  const totalHearings = sum(data.upcomingHearings.map((h) => h.count));
  const nextDay = data.upcomingHearings.find((h) => h.count > 0);

  const paymentRows: ChartRow[] = data.paymentsThisYear.map((p) => ({
    key: p.month,
    label: monthShort(p.month),
    full: monthLong(p.month),
    value: Number(p.amount),
    display: formatPkr(p.amount),
  }));
  const paidTotal = sum(data.paymentsThisYear.map((p) => Number(p.amount)));

  return (
    <Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('My cases by stage')}
          summary={
            totalCases && top
              ? t('{{n}} cases in total; the largest group is "{{stage}}" ({{m}}).', {
                  n: totalCases,
                  stage: t(STAGE_CHART_LABEL[top.stage]),
                  m: top.count,
                })
              : t('You have no submitted cases yet.')
          }
          rows={stageRows}
          horizontal
          labelHeader={t('Stage')}
          valueHeader={t('Cases')}
          empty={t('You have no submitted cases yet.')}
        />
        <ChartCard
          title={t('Hearings in the next 30 days')}
          summary={
            nextDay
              ? t('{{n}} hearings in the next 30 days. The next is on {{date}}.', {
                  n: totalHearings,
                  date: formatDate(nextDay.date),
                })
              : t('No hearings in the next 30 days.')
          }
          rows={hearingRows}
          tickInterval={6}
          color={CHART(2)}
          labelHeader={t('Date')}
          valueHeader={t('Hearings')}
          empty={t('No hearings in the next 30 days.')}
        />
        <ChartCard
          className="lg:col-span-2"
          title={t('Court fees paid this year')}
          summary={t('Paid this year: {{amount}}.', { amount: formatPkr(paidTotal) })}
          rows={paymentRows}
          color={CHART(1)}
          labelHeader={t('Month')}
          valueHeader={t('Amount paid')}
          empty={t('No court fees paid this year.')}
        />
      </div>
    </Section>
  );
}

/** Judge dashboard: hearings per day this week and next, outcomes this month, pending decisions, days to decision. */
export function JudgeInsightsPanel() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useInsights<JudgeInsights>(['JUDGE']);
  if (isError) return <QueryError error={error} className="mb-6" />;
  if (isPending) return <Loading cards={2} />;
  if (!data) return null;

  const dayRows: ChartRow[] = data.hearingsPerDay.map((h) => ({
    key: h.date,
    label: dayShort(h.date),
    full: `${weekdayLong(h.date)} ${formatDate(h.date)}`,
    value: h.count,
    display: String(h.count),
    color: h.week === 'THIS' ? CHART(2) : CHART(4),
  }));
  const thisWeek = sum(data.hearingsPerDay.filter((h) => h.week === 'THIS').map((h) => h.count));
  const nextWeek = sum(data.hearingsPerDay.filter((h) => h.week === 'NEXT').map((h) => h.count));
  const busiest = largest(data.hearingsPerDay, (h) => h.count);

  const outcomeRows: ChartRow[] = data.outcomesThisMonth.map((o, i) => ({
    key: o.status,
    label: t(OUTCOME_LABEL[o.status]),
    full: t(OUTCOME_LABEL[o.status]),
    value: o.count,
    display: String(o.count),
    color: CHART(([2, 3, 5] as const)[i]),
  }));
  const count = (s: keyof typeof OUTCOME_LABEL) =>
    data.outcomesThisMonth.find((o) => o.status === s)?.count ?? 0;

  return (
    <Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('Cases awaiting a decision')}
          value={String(data.pendingDecisions)}
          hint={t('Allocated to you and not yet decided.')}
        />
        <StatCard
          label={t('Average days from first hearing to decision')}
          value={
            data.averageDaysFirstHearingToDecision === null
              ? '—'
              : t('{{n}} days', { n: data.averageDaysFirstHearingToDecision })
          }
          hint={t('Across {{n}} decided cases.', { n: data.decidedCount })}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('Hearings per day, this week and next')}
          summary={
            thisWeek + nextWeek && busiest
              ? t(
                  '{{a}} hearings this week and {{b}} next week. Busiest day: {{day}} ({{n}}). Darker bars are this week.',
                  {
                    a: thisWeek,
                    b: nextWeek,
                    day: formatDate(busiest.date),
                    n: busiest.count,
                  },
                )
              : t('No hearings this week or next.')
          }
          rows={dayRows}
          tickInterval={1}
          labelHeader={t('Date')}
          valueHeader={t('Hearings')}
          empty={t('No hearings this week or next.')}
        />
        <ChartCard
          title={t('Hearing outcomes this month')}
          summary={t(
            'This month: {{held}} held, {{adjourned}} adjourned, {{cancelled}} cancelled.',
            {
              held: count('HELD'),
              adjourned: count('ADJOURNED'),
              cancelled: count('CANCELLED'),
            },
          )}
          rows={outcomeRows}
          labelHeader={t('Outcome')}
          valueHeader={t('Hearings')}
          empty={t('No hearing outcomes recorded this month.')}
        />
      </div>
    </Section>
  );
}

/** Admin dashboard: 12-month trends, categories, fee revenue, days to decision and the busiest courtrooms. */
export function AdminInsightsPanel() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useInsights<AdminInsights>(['ADMIN']);
  if (isError) return <QueryError error={error} className="mb-6" />;
  if (isPending) return <Loading cards={4} />;
  if (!data) return null;

  const filingRows: ChartRow[] = data.filingsPerMonth.map((f) => ({
    key: f.month,
    label: monthShort(f.month),
    full: monthLong(f.month),
    value: f.count,
    display: String(f.count),
  }));
  const filedTotal = sum(data.filingsPerMonth.map((f) => f.count));
  const peak = largest(data.filingsPerMonth, (f) => f.count);

  const rateRows: ChartRow[] = data.disposalRate.map((r) => ({
    key: r.month,
    label: monthShort(r.month),
    full: monthLong(r.month),
    value: r.rate,
    display:
      r.rate === null
        ? t('No filings')
        : t('{{rate}}% ({{decided}} decided, {{filed}} filed)', {
            rate: r.rate,
            decided: r.decided,
            filed: r.filed,
          }),
  }));
  const latestRate = [...data.disposalRate].reverse().find((r) => r.rate !== null);

  const categoryRows: ChartRow[] = data.casesByCategory.map((c, i) => ({
    key: c.caseType,
    label: caseTypeLabel(c.caseType),
    full: caseTypeLabel(c.caseType),
    value: c.count,
    display: String(c.count),
    color: CHART(([1, 2, 3, 4] as const)[i % 4]),
  }));
  const topCategory = largest(data.casesByCategory, (c) => c.count);

  const revenueRows: ChartRow[] = data.feeRevenuePerMonth.map((r) => ({
    key: r.month,
    label: monthShort(r.month),
    full: monthLong(r.month),
    value: Number(r.amount),
    display: formatPkr(r.amount),
  }));
  const revenueTotal = sum(data.feeRevenuePerMonth.map((r) => Number(r.amount)));

  const roomRows: ChartRow[] = data.topCourtrooms.map((r) => ({
    key: r.courtroomId,
    label: r.name,
    full: `${r.name} · ${r.court}`,
    value: r.hearings,
    display: String(r.hearings),
  }));

  return (
    <Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('Average days from filing to decision')}
          value={
            data.averageDaysFilingToDecision === null
              ? '—'
              : t('{{n}} days', { n: data.averageDaysFilingToDecision })
          }
          hint={t('Across {{n}} decisions in the last 12 months.', { n: data.decidedCount })}
        />
        <StatCard
          label={t('Cases filed in the last 12 months')}
          value={String(filedTotal)}
          hint={
            peak && peak.count
              ? t('Busiest month: {{month}} ({{n}}).', {
                  month: monthLong(peak.month),
                  n: peak.count,
                })
              : undefined
          }
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('Filings per month')}
          summary={
            peak && peak.count
              ? t('{{n}} cases filed in the last 12 months; the most in {{month}} ({{m}}).', {
                  n: filedTotal,
                  month: monthLong(peak.month),
                  m: peak.count,
                })
              : t('No cases filed in the last 12 months.')
          }
          rows={filingRows}
          kind="line"
          color={CHART(1)}
          labelHeader={t('Month')}
          valueHeader={t('Cases filed')}
        />
        <ChartCard
          title={t('Disposal rate')}
          summary={
            latestRate
              ? t(
                  'Cases decided in a month as a share of cases filed that month. {{month}}: {{rate}}%.',
                  { month: monthLong(latestRate.month), rate: latestRate.rate },
                )
              : t('No filings in the last 12 months.')
          }
          rows={rateRows}
          kind="line"
          color={CHART(3)}
          labelHeader={t('Month')}
          valueHeader={t('Disposal rate')}
        />
        <ChartCard
          title={t('Cases by category')}
          summary={
            topCategory && topCategory.count
              ? t('Largest category: {{type}} ({{n}} cases).', {
                  type: caseTypeLabel(topCategory.caseType),
                  n: topCategory.count,
                })
              : t('No cases yet.')
          }
          rows={categoryRows}
          horizontal
          labelHeader={t('Category')}
          valueHeader={t('Cases')}
        />
        <ChartCard
          title={t('Court fee revenue per month')}
          summary={t('Fees received in the last 12 months: {{amount}}.', {
            amount: formatPkr(revenueTotal),
          })}
          rows={revenueRows}
          color={CHART(2)}
          labelHeader={t('Month')}
          valueHeader={t('Fees received')}
          empty={t('No fees received in the last 12 months.')}
        />
        <ChartCard
          className="lg:col-span-2"
          title={t('Busiest courtrooms')}
          summary={
            data.topCourtrooms[0]
              ? t('Hearings in the last 90 days. Busiest: {{room}} ({{n}}).', {
                  room: `${data.topCourtrooms[0].name} · ${data.topCourtrooms[0].court}`,
                  n: data.topCourtrooms[0].hearings,
                })
              : t('No hearings in the last 90 days.')
          }
          rows={roomRows}
          horizontal
          height="h-52"
          labelHeader={t('Courtroom')}
          valueHeader={t('Hearings')}
          empty={t('No hearings in the last 90 days.')}
        />
      </div>
    </Section>
  );
}
