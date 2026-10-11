import { translateText } from '@/lib/server-messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ShieldCheck, ShieldAlert, Download, History } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import type { CaseType } from '@/lib/case-status';
import { formatDateTime } from '@/lib/format';
import {
  reportsApi,
  type Bucket,
  type PerformanceFilters,
  type PerformanceReport,
  type ReportHistoryRow,
  type ReportVerification,
} from '@/lib/phase4e-api';
import { ExportMenu } from './ExportMenu';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const MONTHS = [
  msg('Jan'),
  msg('Feb'),
  msg('Mar'),
  msg('Apr'),
  msg('May'),
  msg('Jun'),
  msg('Jul'),
  msg('Aug'),
  msg('Sep'),
  msg('Oct'),
  msg('Nov'),
  msg('Dec'),
];
const AXIS = { fontSize: 12, fill: 'var(--color-text-muted)' };
const pct = (n: number | null) => (n === null ? 'n/a' : `${n}%`);
const num = (n: number | null) => (n === null ? 'n/a' : String(n));

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-text-muted">{label}</p>
        <p className="mt-1 font-heading text-3xl font-bold text-primary">{value}</p>
        {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function BucketTable({ title, first, rows }: { title: string; first: string; rows: Bucket[] }) {
  const { t } = useTranslation();
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-heading text-base font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t('No cases in this period.')}</p>
      ) : (
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead>{first}</TableHead>
              <TableHead className="text-end">{t('Filed')}</TableHead>
              <TableHead className="text-end">{t('Decided')}</TableHead>
              <TableHead className="text-end">{t('Pending')}</TableHead>
              <TableHead className="text-end">{t('Disposal rate')}</TableHead>
              <TableHead className="text-end">{t('Avg trial days')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.key}>
                <TableCell className="font-medium">{translateText(b.label)}</TableCell>
                <TableCell className="text-end">{b.filed}</TableCell>
                <TableCell className="text-end">{b.decided}</TableCell>
                <TableCell className="text-end">{b.pending}</TableCell>
                <TableCell className="text-end">{pct(b.disposalRatePercent)}</TableCell>
                <TableCell className="text-end">{num(b.avgTrialDays)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function Results({ report }: { report: PerformanceReport }) {
  const { t } = useTranslation();
  const s = report.summary;
  const empty = s.filed === 0 && s.decided === 0 && s.pending === 0;
  return (
    <div className="space-y-6" aria-live="polite">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={t('Cases filed')} value={String(s.filed)} hint={report.params.periodLabel} />
        <Stat label={t('Cases decided')} value={String(s.decided)} />
        <Stat label={t('Pending at the end of the period')} value={String(s.pending)} />
        <Stat
          label={t('Disposal rate')}
          value={pct(s.disposalRatePercent)}
          hint={t('Decided divided by filed')}
        />
        <Stat
          label={t('Average trial duration')}
          value={s.avgTrialDays === null ? 'n/a' : `${s.avgTrialDays} days`}
          hint={t('Filing date to decision')}
        />
        <Stat label={t('Hearings per decided case')} value={num(s.avgHearingsPerDecided)} />
      </div>
      {empty ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title={t('No cases match these filters')}
            description={t('Widen the month range or clear the judge and court filters.')}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('Filed and decided, month by month')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="h-72"
                role="img"
                aria-label={t('Bar chart of cases filed and decided per month')}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.monthly}
                    margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                  >
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} stroke="var(--color-border)" />
                    <YAxis allowDecimals={false} tick={AXIS} stroke="var(--color-border)" />
                    <Tooltip
                      contentStyle={{ borderRadius: 6, border: '1px solid var(--color-border)' }}
                    />
                    <Legend />
                    <Bar
                      dataKey="filed"
                      name="Filed"
                      fill="var(--color-chart-4)"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="decided"
                      name="Decided"
                      fill="var(--color-chart-1)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t('Show the chart as a table')}
                </summary>
                <Table aria-label={t('Monthly figures')} className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Month')}</TableHead>
                      <TableHead className="text-end">{t('Filed')}</TableHead>
                      <TableHead className="text-end">{t('Decided')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.monthly.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{translateText(m.label)}</TableCell>
                        <TableCell className="text-end">{m.filed}</TableCell>
                        <TableCell className="text-end">{m.decided}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </CardContent>
          </Card>
          <BucketTable
            title={t('By case category')}
            first={t('Category')}
            rows={report.byCaseType}
          />
          <BucketTable title={t('By judge bench')} first={t('Judge')} rows={report.byJudge} />
          <BucketTable title={t('By court')} first={t('Court')} rows={report.byCourt} />
        </>
      )}
    </div>
  );
}

function HistorySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [verdicts, setVerdicts] = useState<Record<string, ReportVerification>>({});
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'reports', 'history', page],
    queryFn: () => reportsApi.history(page),
  });
  const verify = useMutation({
    mutationFn: (id: string) => reportsApi.verify(id),
    onSuccess: (r, id) => {
      setVerdicts((v) => ({ ...v, [id]: r }));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const download = useMutation({
    mutationFn: (row: ReportHistoryRow) => reportsApi.download(row),
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <h2 id="history-title" className="flex items-center gap-2 font-heading text-xl font-bold">
        <History className="size-5 text-primary" aria-hidden="true" /> {t('Report history')}
      </h2>
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-32" />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title={t('No exports yet')}
            description={t('Exported reports appear here with a verification code.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Report history')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Code')}</TableHead>
                  <TableHead>{t('Report')}</TableHead>
                  <TableHead>{t('Format')}</TableHead>
                  <TableHead>{t('Generated')}</TableHead>
                  <TableHead>{t('By')}</TableHead>
                  <TableHead>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => {
                  const v = verdicts[r.id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {r.code}
                      </TableCell>
                      <TableCell>
                        {r.kind === 'PERFORMANCE' ? t('Performance') : t('Audit trail')}
                      </TableCell>
                      <TableCell>{r.format === 'PDF' ? 'PDF' : t('Excel')}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>{r.generatedBy}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => download.mutate(r)}>
                            <Download aria-hidden="true" /> {t('Download')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={verify.isPending && verify.variables === r.id}
                            onClick={() => verify.mutate(r.id)}
                          >
                            <ShieldCheck aria-hidden="true" /> {t('Verify')}
                          </Button>
                          {v && (
                            <Badge variant={v.status === 'valid' ? 'decided' : 'rejected'}>
                              {v.status === 'valid' ? t('Valid') : t('Tampered')}
                            </Badge>
                          )}
                        </div>
                        {v && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-text-muted">
                            {v.status === 'tampered' && (
                              <ShieldAlert
                                className="mt-0.5 size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {translateText(v.message)}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
            />
          </>
        )
      )}
    </section>
  );
}

/** "Judicial Performance & Statistical Engine" */
export default function PerformancePage() {
  const { t } = useTranslation();
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState({
    year: String(thisYear),
    monthFrom: '1',
    monthTo: String(new Date().getMonth() + 1),
    caseType: '',
    judgeId: '',
    courtId: '',
  });
  const [compiled, setCompiled] = useState<PerformanceFilters | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const options = useQuery({
    queryKey: ['admin', 'reports', 'options'],
    queryFn: () => reportsApi.options(),
  });
  const report = useQuery({
    queryKey: ['admin', 'reports', 'performance', compiled],
    queryFn: () => reportsApi.compile(compiled as PerformanceFilters),
    enabled: compiled !== null,
    retry: false,
  });

  function compile(e: React.FormEvent) {
    e.preventDefault();
    if (Number(form.monthFrom) > Number(form.monthTo)) {
      return setFormError(t('The last month must not be before the first month.'));
    }
    setFormError(null);
    setCompiled({
      year: Number(form.year),
      monthFrom: Number(form.monthFrom),
      monthTo: Number(form.monthTo),
      caseType: (form.caseType as CaseType) || undefined,
      judgeId: form.judgeId || undefined,
      courtId: form.courtId || undefined,
    });
  }

  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const exportParams: Record<string, unknown> | null = compiled
    ? {
        year: compiled.year,
        monthFrom: compiled.monthFrom,
        monthTo: compiled.monthTo,
        ...(compiled.caseType ? { caseType: compiled.caseType } : {}),
        ...(compiled.judgeId ? { judgeId: compiled.judgeId } : {}),
        ...(compiled.courtId ? { courtId: compiled.courtId } : {}),
      }
    : null;

  return (
    <>
      <PageHeader
        title={t('Judicial Performance & Statistical Engine')}
        description={t(
          'Case resolution ratios and average trial cycle lengths for a chosen period, judge bench and court.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Reports') }]}
      />
      <Card className="mb-6">
        <CardContent>
          <form noValidate onSubmit={compile} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {formError && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Alert variant="error">{formError}</Alert>
              </div>
            )}
            <Field label={t('Target Year')} required>
              {(p) => (
                <NativeSelect {...p} value={form.year} onChange={set('year')}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Month range: from')} required>
              {(p) => (
                <NativeSelect {...p} value={form.monthFrom} onChange={set('monthFrom')}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Month range: to')} required>
              {(p) => (
                <NativeSelect {...p} value={form.monthTo} onChange={set('monthTo')}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Case Category')}>
              {(p) => (
                <NativeSelect {...p} value={form.caseType} onChange={set('caseType')}>
                  <option value="">{t('All categories')}</option>
                  {options.data?.caseTypes.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {t(ct.label)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Specific Judge Bench Identifier')}>
              {(p) => (
                <NativeSelect {...p} value={form.judgeId} onChange={set('judgeId')}>
                  <option value="">{t('All judge benches')}</option>
                  {options.data?.judges.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Court')}>
              {(p) => (
                <NativeSelect {...p} value={form.courtId} onChange={set('courtId')}>
                  <option value="">{t('All courts')}</option>
                  {options.data?.courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" loading={report.isFetching}>
                <BarChart3 aria-hidden="true" /> {t('Compile Report Profile Data Layout')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {report.isError && <Alert variant="error">{parseApiError(report.error).message}</Alert>}
      {compiled && report.isPending && <Skeleton className="h-64" />}
      {report.data && (
        <div className="mb-8 space-y-6">
          <Results report={report.data} />
          {exportParams && <ExportMenu kind="PERFORMANCE" params={exportParams} />}
        </div>
      )}
      {!compiled && (
        <Card className="mb-8">
          <EmptyState
            icon={BarChart3}
            title={t('Choose the period and compile')}
            description={t('The overview sheets, monthly chart and breakdown tables appear here.')}
          />
        </Card>
      )}
      <HistorySection />
    </>
  );
}
