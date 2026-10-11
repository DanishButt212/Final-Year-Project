import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  FileStack,
  Hourglass,
  Inbox,
  Scale,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi, type DashboardStats, type DayCount } from '@/lib/admin-api';
import { caseTypeLabel, STATUS_BADGES, type CaseStatus } from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const AXIS = { fontSize: 12, fill: 'var(--color-text-muted)' };
const dayLabel = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Scale;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-3xl font-bold leading-none">{value.toLocaleString('en-PK')}</p>
          <p className="mt-1 text-sm text-text-muted">{label}</p>
          {hint && <p className="text-xs text-text-muted">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
  summary,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  summary: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-text-muted">{description}</p>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={summary} className="h-64 w-full">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyLine({ data, color, label }: { data: DayCount[]; color: string; label: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dayLabel}
          tick={AXIS}
          interval={4}
          stroke="var(--color-border)"
        />
        <YAxis allowDecimals={false} tick={AXIS} stroke="var(--color-border)" />
        <Tooltip
          labelFormatter={(v) => formatDate(String(v))}
          formatter={(v) => [v as number, label]}
          contentStyle={{ borderRadius: 6, border: '1px solid var(--color-border)' }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
}

function HealthCard({ health }: { health: DashboardStats['health'] }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('Server uptime'), uptime(health.uptimeSeconds)],
    [t('Database'), health.database === 'up' ? t('Connected') : t('Unreachable')],
    [t('Database ping'), `${health.databaseLatencyMs} ms`],
    [t('Server memory (RSS)'), `${health.memory.rssMb} MB`],
    [
      t('Heap in use'),
      t('{{heapUsedMb}} of {{heapTotalMb}} MB', {
        heapUsedMb: health.memory.heapUsedMb,
        heapTotalMb: health.memory.heapTotalMb,
      }),
    ],
    [t('Host memory in use'), `${health.memory.systemUsedPercent}%`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5 text-primary" aria-hidden="true" /> {t('System health')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** UC-1.3: Centralized Operations & Analytics Board. */
export default function AnalyticsBoard() {
  const { t } = useTranslation();
  const [courtId, setCourtId] = useState('');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'stats', courtId],
    queryFn: () => adminApi.stats(courtId || undefined),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const statusData = data
    ? (Object.keys(data.cases.byStatus) as CaseStatus[])
        .filter((s) => data.cases.byStatus[s] > 0)
        .map((s) => ({ status: t(STATUS_BADGES[s].label), count: data.cases.byStatus[s] }))
    : [];
  const filedTotal = data?.cases.filedPerDay.reduce((a, d) => a + d.count, 0) ?? 0;
  const decidedTotal = data?.cases.decidedPerDay.reduce((a, d) => a + d.count, 0) ?? 0;

  return (
    <section aria-label={t('Operations and analytics')} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t('Centralized Operations & Analytics Board')}</h2>
          <p className="text-text-muted">
            {t('Live metrics. The court filter applies to case and document figures.')}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Field label={t('Court precinct')}>
            {(p) => (
              <NativeSelect value={courtId} onChange={(e) => setCourtId(e.target.value)} {...p}>
                <option value="">{t('All courts')}</option>
                {data?.courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      </div>

      {isError && <QueryError error={error} />}

      {isPending ? (
        <div role="status" aria-label={t('Loading analytics')} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <span className="sr-only">{t('Loading…')}</span>
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="analytics">
              <Stat icon={Scale} label={t('Total cases')} value={data.cases.total} />
              <Stat
                icon={Hourglass}
                label={t('Pending assignment')}
                value={data.cases.pendingAssignment}
              />
              <Stat
                icon={Activity}
                label={t('Active (allocated) cases')}
                value={data.cases.active}
              />
              <Stat
                icon={FileStack}
                label={t('Documents')}
                value={data.documents.total}
                hint={t('{{attachedLast7Days}} attached in the last 7 days', {
                  attachedLast7Days: data.documents.attachedLast7Days,
                })}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title={t('Cases by status')}
                description={t('Number of cases in each stage.')}
                summary={t('Cases by status: {{value}}', {
                  value:
                    statusData.map((d) => `${d.status} ${d.count}`).join(', ') || t('no cases'),
                })}
              >
                {statusData.length === 0 ? (
                  <EmptyState icon={Inbox} title={t('No cases yet')} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={statusData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid stroke="var(--color-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={AXIS}
                        stroke="var(--color-border)"
                      />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={130}
                        tick={AXIS}
                        stroke="var(--color-border)"
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--color-primary-soft)' }}
                        contentStyle={{
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Cases"
                        fill="var(--color-chart-2)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title={t('Cases filed per day')}
                description={t('Last 30 days.')}
                summary={t('Cases filed per day over the last 30 days: {{filedTotal}} in total', {
                  filedTotal,
                })}
              >
                <DailyLine
                  data={data.cases.filedPerDay}
                  color={'var(--color-chart-2)'}
                  label={t('Filed')}
                />
              </ChartCard>

              <ChartCard
                title={t('Cases decided per day (clearing rate)')}
                description={t('Last 30 days.')}
                summary={t(
                  'Cases decided per day over the last 30 days: {{decidedTotal}} in total',
                  { decidedTotal },
                )}
              >
                <DailyLine
                  data={data.cases.decidedPerDay}
                  color={'var(--color-chart-1)'}
                  label={t('Decided')}
                />
              </ChartCard>

              <Card data-tour="pending-allocation">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{t('Pending allocation')}</CardTitle>
                  <Link
                    to="/admin/cases?status=PENDING_ASSIGNMENT"
                    className="text-sm font-semibold"
                  >
                    {t('Open Case Registry')}
                  </Link>
                </CardHeader>
                {data.pendingAssignmentList.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title={t('Nothing waiting')}
                    description={t('Every registered case has been allocated to a judge.')}
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.pendingAssignmentList.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/admin/cases/${c.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-3 text-text no-underline hover:bg-primary-soft"
                        >
                          <span className="min-w-0">
                            <span className="case-number block text-sm font-medium text-primary">
                              {c.ucn}
                            </span>
                            <span className="block break-words font-semibold">
                              <bdi>{c.title}</bdi>
                            </span>
                            <span className="block text-sm text-text-muted">
                              {t('{{caseTypeLabel}} · Filed {{date}}', {
                                caseTypeLabel: caseTypeLabel(c.caseType),
                                date: formatDate(c.filingDate),
                              })}
                            </span>
                          </span>
                          <ArrowRight
                            className="size-4 shrink-0 text-primary rtl:-scale-x-100"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <HealthCard health={data.health} />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="size-5 text-primary" aria-hidden="true" /> {t('Accounts')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <div key={r}>
                        <dt className="text-sm text-text-muted">{t(ROLE_LABEL[r])}</dt>
                        <dd className="font-semibold">{data.users.byRole[r] ?? 0}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link
                    to="/admin/lawyer-verification"
                    className="flex items-center gap-2 rounded-md border border-border p-3 font-semibold text-text no-underline hover:bg-primary-soft"
                  >
                    <UserCheck className="size-5 text-primary" aria-hidden="true" />
                    {data.pendingLawyerApprovals === 1
                      ? t('1 lawyer approval pending')
                      : t('{{count}} lawyer approvals pending', {
                          count: data.pendingLawyerApprovals,
                        })}
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )
      )}
    </section>
  );
}
