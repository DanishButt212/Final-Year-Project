import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { History, Lock, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { DetailSkeleton, TableSkeleton } from '@/components/ui/skeleton';
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
import { formatDateTime } from '@/lib/format';
import { codeLabel, roleLabel } from '@/lib/labels';
import { auditApi, type AuditFilters, type AuditVerification } from '@/lib/phase4e-api';
import { ExportMenu } from './ExportMenu';
import { useTranslation } from 'react-i18next';

function IntegrityBadge({ state }: { state: 'valid' | 'mismatch' | 'legacy' }) {
  const { t } = useTranslation();
  if (state === 'valid') return <Badge variant="decided">{t('Hash matches')}</Badge>;
  if (state === 'mismatch') return <Badge variant="rejected">{t('Hash mismatch')}</Badge>;
  return <Badge variant="neutral">{t('Legacy entry (no hash)')}</Badge>;
}

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'audit', 'detail', id],
    queryFn: () => auditApi.detail(id),
  });
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={data ? data.eventId : t('Audit event')}
      description={t('Read-only. This entry can never be edited or deleted.')}
    >
      {error && <QueryError error={error} />}
      {isPending ? (
        <DetailSkeleton />
      ) : (
        data && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <IntegrityBadge state={data.integrity} />
              <Badge variant={data.success ? 'decided' : 'rejected'}>
                {data.success ? t('Succeeded') : t('Failed')}
              </Badge>
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="text-text-muted">{t('Time')}</dt>
                <dd className="font-medium">{formatDateTime(data.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Event type')}</dt>
                <dd>
                  {codeLabel(data.action)}
                  <span className="block font-mono text-xs text-text-muted">{data.action}</span>
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Account')}</dt>
                <dd className="font-medium">
                  {data.actor ? `${data.actor.name} (${data.actor.email})` : t('System')}
                  {data.actorRole ? ` · ${roleLabel(data.actorRole)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('User hash')}</dt>
                <dd className="font-mono">{data.userHash}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Target')}</dt>
                <dd className="break-all font-mono">
                  {data.entity ?? '—'} {data.entityId ?? ''}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Address and device')}</dt>
                <dd className="break-words">
                  {data.ipAddress ?? '—'}
                  {data.userAgent ? ` · ${data.userAgent}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Event hash (SHA-256)')}</dt>
                <dd className="break-all font-mono text-xs">
                  {data.eventHash ?? t('none (legacy entry)')}
                </dd>
              </div>
            </dl>
            <section>
              <h3 className="mb-1 font-bold">{t('Metadata')}</h3>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {data.metadata ? JSON.stringify(data.metadata, null, 2) : t('No metadata')}
              </pre>
            </section>
          </div>
        )
      )}
    </Drawer>
  );
}

/** "Master Audit Logs & Events Immutable History Vault" */
export default function AuditVaultPage() {
  const { t } = useTranslation();
  const blank = { q: '', action: '', entity: '', actor: '', from: '', to: '' };
  const [form, setForm] = useState(blank);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AuditVerification | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const facets = useQuery({
    queryKey: ['admin', 'audit', 'facets'],
    queryFn: () => auditApi.facets(),
  });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'audit', 'list', filters, page],
    queryFn: () => auditApi.list({ ...filters, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const verify = useMutation({
    mutationFn: () => auditApi.verify({ from: filters.from, to: filters.to }),
    onSuccess: (r) => setVerdict(r),
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (form.from && form.to && form.from > form.to) {
      return setFormError(t('The start date must not be after the end date.'));
    }
    setFormError(null);
    setVerdict(null);
    setPage(1);
    setFilters(
      Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')) as AuditFilters,
    );
  }
  function reset() {
    setForm(blank);
    setFormError(null);
    setVerdict(null);
    setPage(1);
    setFilters({});
  }

  return (
    <>
      <PageHeader
        title={t('Master Audit Logs & Events Immutable History Vault')}
        description={t(
          'Tamper-proof record of case status changes, data mutations and master account actions, newest first.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Audit Logs') }]}
      />
      <Alert variant="info" className="mb-4">
        <Lock className="me-1 inline size-4" aria-hidden="true" />
        {t(
          'This vault is read-only. Entries cannot be edited or deleted, even by an administrator: the database itself rejects any change.',
        )}
      </Alert>

      <Card className="mb-4">
        <CardContent>
          <form noValidate onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {formError && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Alert variant="error">{formError}</Alert>
              </div>
            )}
            <Field label={t('Search')} hint={t('Event ID, event type, target or account email')}>
              {(p) => <Input {...p} value={form.q} onChange={set('q')} maxLength={100} />}
            </Field>
            <Field label={t('Event type')}>
              {(p) => (
                <NativeSelect {...p} value={form.action} onChange={set('action')}>
                  <option value="">{t('All event types')}</option>
                  {facets.data?.actions.map((a) => (
                    <option key={a} value={a}>
                      {codeLabel(a)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Target record type')}>
              {(p) => (
                <NativeSelect {...p} value={form.entity} onChange={set('entity')}>
                  <option value="">{t('All record types')}</option>
                  {facets.data?.entities.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Target account')} hint={t('Account email, or part of it')}>
              {(p) => <Input {...p} value={form.actor} onChange={set('actor')} maxLength={120} />}
            </Field>
            <Field label={t('From date')}>
              {(p) => <DatePicker {...p} value={form.from} onChange={set('from')} />}
            </Field>
            <Field label={t('To date')}>
              {(p) => <DatePicker {...p} value={form.to} onChange={set('to')} />}
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">
                <Search aria-hidden="true" /> {t('Apply filters')}
              </Button>
              <Button type="button" variant="secondary" onClick={reset}>
                {t('Clear')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={verify.isPending}
                onClick={() => verify.mutate()}
              >
                <ShieldCheck aria-hidden="true" /> {t('Verify integrity')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {verdict && (
        <Alert variant={verdict.mismatched > 0 ? 'error' : 'success'} className="mb-4">
          {verdict.mismatched > 0 && (
            <ShieldAlert className="me-1 inline size-4" aria-hidden="true" />
          )}
          {verdict.from || verdict.to
            ? t('{{total}} entries checked for {{from}} to {{to}}:', {
                total: verdict.total.toLocaleString('en-PK'),
                from: verdict.from ?? t('the start'),
                to: verdict.to ?? t('today'),
              })
            : t('{{total}} entries checked:', {
                total: verdict.total.toLocaleString('en-PK'),
              })}{' '}
          {t(
            '{{valid}} valid, {{mismatched}} mismatched, {{legacy}} legacy (written before hashing began).',
            {
              valid: verdict.valid.toLocaleString('en-PK'),
              mismatched: verdict.mismatched.toLocaleString('en-PK'),
              legacy: verdict.legacy.toLocaleString('en-PK'),
            },
          )}
          {verdict.mismatched > 0 &&
            ` ${t('Mismatched: {{ids}}.', { ids: verdict.mismatchedIds.join(', ') })}`}
        </Alert>
      )}

      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={8} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title={t('No audit entries match')}
            description={t('Change or clear the filters to see more.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Audit log')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Event ID')}</TableHead>
                  <TableHead>{t('Time')}</TableHead>
                  <TableHead>{t('User hash')}</TableHead>
                  <TableHead>{t('Event type')}</TableHead>
                  <TableHead>{t('Target')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setOpen(r.id)}
                        className="min-h-10 rounded font-mono text-xs font-semibold text-primary underline underline-offset-2"
                      >
                        {r.eventId}
                      </button>
                      {r.legacy && <p className="text-xs text-text-muted">{t('legacy')}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.userHash}</TableCell>
                    <TableCell>
                      <span title={r.action}>{codeLabel(r.action)}</span>
                      {r.actor && <p className="text-xs text-text-muted">{r.actor.email}</p>}
                    </TableCell>
                    <TableCell>{r.entity ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.success ? 'decided' : 'rejected'}>
                        {r.success ? t('Succeeded') : t('Failed')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
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

      <div className="mt-8">
        <ExportMenu kind="AUDIT_TRAIL" params={{ ...filters }} title={t('Export Audit Trail')} />
      </div>
      {open && <DetailDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
