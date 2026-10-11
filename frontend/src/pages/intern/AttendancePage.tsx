import { msg } from '@/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LogOut, MapPin } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseApiError } from '@/lib/api';
import { getPosition, internApi, LOCATION_DENIED } from '@/lib/chamber-api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Trans, useTranslation } from 'react-i18next';

const time = (v: string | null) => (v ? formatDateTime(v).slice(11) : '—');
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Geo-fenced "Check-In / Log Bench Attendance". The server verifies the position against the court geo-fence. */
/** Today's attendance in one sentence per variant (with or without court, before or after check-out). */
const ATTENDANCE_LINE: Record<string, string> = {
  'court:in': msg('Checked in at <b>{{in}}</b> at {{court}}.'),
  'court:out': msg('Checked in at <b>{{in}}</b> at {{court}}, checked out at {{out}}.'),
  'none:in': msg('Checked in at <b>{{in}}</b>.'),
  'none:out': msg('Checked in at <b>{{in}}</b>, checked out at {{out}}.'),
};

export default function AttendancePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['intern', 'attendance', month],
    queryFn: () => internApi.attendance(month),
  });

  async function run(kind: 'in' | 'out') {
    setBusy(kind);
    setResult(null);
    try {
      const point = await getPosition();
      const res = kind === 'in' ? await internApi.checkIn(point) : await internApi.checkOut(point);
      setResult({ ok: true, text: res.message });
      await queryClient.invalidateQueries({ queryKey: ['intern'] });
    } catch (e) {
      setResult({
        ok: false,
        text:
          e instanceof Error && e.message === LOCATION_DENIED
            ? LOCATION_DENIED
            : parseApiError(e).message,
      });
    } finally {
      setBusy(null);
    }
  }

  const today = data?.today ?? null;

  return (
    <>
      <PageHeader
        title={t('Attendance')}
        description={t(
          'Log your presence at the court. You must be physically inside the court complex.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/intern' }, { label: t('Attendance') }]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-primary" aria-hidden="true" /> {t('Today')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result && <Alert variant={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
            {today ? (
              <p className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                <span>
                  <Trans
                    i18nKey={
                      ATTENDANCE_LINE[
                        `${today.court ? 'court' : 'none'}:${today.checkOutAt ? 'out' : 'in'}`
                      ]
                    }
                    defaults={
                      ATTENDANCE_LINE[
                        `${today.court ? 'court' : 'none'}:${today.checkOutAt ? 'out' : 'in'}`
                      ]
                    }
                    values={{
                      in: time(today.checkInAt),
                      court: today.court ?? '',
                      out: today.checkOutAt ? time(today.checkOutAt) : '',
                    }}
                    components={{ b: <strong /> }}
                  />
                </span>
              </p>
            ) : (
              <p className="text-text-muted">{t('You have not logged attendance today.')}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => run('in')}
                loading={busy === 'in'}
                disabled={busy !== null || Boolean(today)}
              >
                <MapPin aria-hidden="true" /> {t('Check-In / Log Bench Attendance')}
              </Button>
              {today && !today.checkOutAt && (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => run('out')}
                  loading={busy === 'out'}
                  disabled={busy !== null}
                >
                  <LogOut className="rtl:-scale-x-100" aria-hidden="true" /> {t('Check out')}
                </Button>
              )}
            </div>
            {busy && (
              <p className="text-sm text-text-muted" aria-live="polite">
                {t('Getting your location and verifying it with the server...')}
              </p>
            )}
            <p className="text-sm text-text-muted">
              {t(
                'Your browser asks for permission to use your location. Allow it, ideally outdoors, with an accuracy better than {{value}} m. One check-in counts per day. The coordinates are checked on the server and are not stored in the audit log.',
                { value: data?.maxAccuracyM ?? 150 },
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('History')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <Field label={t('Month')}>
                {(p) => (
                  <Input
                    type="month"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                    {...p}
                  />
                )}
              </Field>
            </div>
            {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
            {isPending ? (
              <TableSkeleton rows={4} cols={5} />
            ) : data && data.data.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title={t('No attendance this month')}
                description={t('Verified check-ins appear here.')}
              />
            ) : (
              data && (
                <Table aria-label={t('Attendance history')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead>{t('In')}</TableHead>
                      <TableHead>{t('Out')}</TableHead>
                      <TableHead>{t('Court')}</TableHead>
                      <TableHead>{t('Location')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(a.date)}</TableCell>
                        <TableCell>{time(a.checkInAt)}</TableCell>
                        <TableCell>{time(a.checkOutAt)}</TableCell>
                        <TableCell>{a.court ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={a.verified ? 'decided' : 'rejected'}>
                            {a.verified ? t('Verified') : t('Not verified')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
