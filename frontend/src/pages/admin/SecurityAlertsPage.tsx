import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { codeLabel, roleLabel } from '@/lib/labels';
import { securityApi, type SecurityAlert } from '@/lib/phase4e-api';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

// eslint-disable-next-line react-refresh/only-export-components -- message constant, translated where shown
export const NOT_ENFORCED = msg('Recorded, not enforced on local development hosts.');

const STATUS: Record<
  SecurityAlert['status'],
  { variant: 'rejected' | 'neutral' | 'decided'; label: string }
> = {
  OPEN: { variant: 'rejected', label: msg('Open') },
  DISMISSED: { variant: 'neutral', label: msg('Dismissed') },
  BLOCKED: { variant: 'decided', label: 'Host blocked' },
};

const refreshAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['admin', 'security'] });

function AlertDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'security', 'alert', id],
    queryFn: () => securityApi.alert(id),
  });
  const blacklist = useMutation({
    mutationFn: () => securityApi.blacklist(id),
    onSuccess: async (r) => {
      toast.success(r.message);
      if (r.note) toast.info(r.note);
      setConfirm(false);
      await refreshAll(qc);
    },
    onError: (e) => {
      setConfirm(false);
      toast.error(parseApiError(e).message);
    },
  });
  const dismiss = useMutation({
    mutationFn: () => securityApi.dismiss(id),
    onSuccess: async (r) => {
      toast.success(r.message);
      await refreshAll(qc);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('Security alert')}
      description={t('Privilege escalation threat')}
    >
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <p>{t('Loading...')}</p>
      ) : (
        data && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS[data.status].variant}>{t(STATUS[data.status].label)}</Badge>
              {data.loopback && <Badge variant="neutral">{t('Local development host')}</Badge>}
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="text-text-muted">{t('Offending IP address')}</dt>
                <dd className="font-mono font-medium">{data.ip ?? 'unknown'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Account')}</dt>
                <dd className="font-medium">
                  {data.account
                    ? `${data.account.name ? `${data.account.name} · ` : ''}${data.account.email}`
                    : t('Not identified (forged or invalid token)')}
                  {data.role ? ` · ${roleLabel(data.role)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Action code')}</dt>
                <dd title={data.lastActionCode}>{codeLabel(data.lastActionCode)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Last route')}</dt>
                <dd className="break-all font-mono">{data.lastRoute ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Refused attempts')}</dt>
                <dd className="font-medium">{data.attemptCount}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('Raised')}</dt>
                <dd className="font-medium">{formatDateTime(data.createdAt)}</dd>
              </div>
              {data.resolvedAt && (
                <div>
                  <dt className="text-text-muted">{t('Handled')}</dt>
                  <dd className="font-medium">
                    {formatDateTime(data.resolvedAt)}
                    {data.resolvedBy ? ` by ${data.resolvedBy}` : ''}
                  </dd>
                </div>
              )}
            </dl>
            {data.account?.id && (
              <p className="rounded-md border border-border bg-primary-soft p-2">
                {t('The account’s active sessions were ended when this alert was raised.')}
              </p>
            )}
            <section>
              <h3 className="mb-1 font-bold">{t('Recent refused requests')}</h3>
              {data.events.length === 0 ? (
                <p className="text-text-muted">{t('No raw events recorded.')}</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {data.events.map((e) => (
                    <li key={e.id} className="p-2">
                      <p className="font-mono text-xs">
                        {e.method} {e.route}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatDateTime(e.createdAt)} · {e.code} · {e.ip ?? 'unknown'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {data.status === 'OPEN' && (
              <div className="space-y-2 border-t border-border pt-4">
                {data.loopback && (
                  <Alert variant="info">
                    {t(
                      'This is a local development address. Blocking is recorded, not enforced on local development hosts.',
                    )}
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => setConfirm(true)}
                    disabled={!data.ip}
                  >
                    <Ban aria-hidden="true" /> {t('Blacklist Client Host Address')}
                  </Button>
                  <Button
                    variant="secondary"
                    loading={dismiss.isPending}
                    onClick={() => dismiss.mutate()}
                  >
                    {t('Dismiss alert')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('Blacklist this host?')}
        description={t(
          'All requests from {{value}} will be refused with "Access denied." You can unblock it later under Blocked hosts.',
          { value: data?.ip ?? t('this address') },
        )}
        confirmLabel={t('Blacklist Client Host Address')}
        destructive
        loading={blacklist.isPending}
        onConfirm={() => blacklist.mutate()}
      />
    </Drawer>
  );
}

function AlertsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'OPEN' | 'DISMISSED' | 'BLOCKED' | ''>('OPEN');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'security', 'alerts', status],
    queryFn: () => securityApi.alerts(status || undefined),
    refetchInterval: 30_000,
  });
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Field label={t('Show alerts')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="OPEN">{t('Open')}</option>
              <option value="BLOCKED">{t('Host blocked')}</option>
              <option value="DISMISSED">{t('Dismissed')}</option>
              <option value="">{t('All')}</option>
            </NativeSelect>
          )}
        </Field>
      </div>
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-40" />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title={t('No alerts here')}
            description={t('Alerts appear when an account is refused repeatedly on admin routes.')}
          />
        </Card>
      ) : (
        data && (
          <Table aria-label={t('Security alerts')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('IP address')}</TableHead>
                <TableHead>{t('Account')}</TableHead>
                <TableHead>{t('Action code')}</TableHead>
                <TableHead className="text-end">{t('Attempts')}</TableHead>
                <TableHead>{t('Raised')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.ip ?? 'unknown'}</TableCell>
                  <TableCell>
                    {a.account ? a.account.email : t('Not identified')}
                    {a.role && <p className="text-xs text-text-muted">{roleLabel(a.role)}</p>}
                  </TableCell>
                  <TableCell title={a.lastActionCode}>{codeLabel(a.lastActionCode)}</TableCell>
                  <TableCell className="text-end">{a.attemptCount}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[a.status].variant}>{t(STATUS[a.status].label)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setOpen(a.id)}>
                      {t('Review')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
      {open && <AlertDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BlockedTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ id: string; ip: string } | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'security', 'blocked'],
    queryFn: () => securityApi.blockedHosts(),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => securityApi.unblock(id),
    onSuccess: async (r) => {
      toast.success(r.message);
      setTarget(null);
      await refreshAll(qc);
    },
    onError: (e) => {
      setTarget(null);
      toast.error(parseApiError(e).message);
    },
  });
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-32" />
      ) : data && data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ban}
            title={t('No blocked hosts')}
            description={t('Blacklisted addresses are listed here.')}
          />
        </Card>
      ) : (
        data && (
          <Table aria-label={t('Blocked hosts')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('IP address')}</TableHead>
                <TableHead>{t('Reason')}</TableHead>
                <TableHead>{t('Blocked')}</TableHead>
                <TableHead>{t('By')}</TableHead>
                <TableHead>{t('Enforcement')}</TableHead>
                <TableHead>{t('Action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.ip}</TableCell>
                  <TableCell>{b.reason}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(b.createdAt)}</TableCell>
                  <TableCell>{b.createdBy}</TableCell>
                  <TableCell>
                    {b.enforced ? (
                      <Badge variant="decided">{t('Enforced')}</Badge>
                    ) : (
                      <span className="text-sm">{t(NOT_ENFORCED)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setTarget({ id: b.id, ip: b.ip })}
                    >
                      {t('Unblock')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('Unblock this host?')}
        description={t('{{value}} will be able to reach the system again.', {
          value: target?.ip ?? t('This address'),
        })}
        confirmLabel={t('Unblock host')}
        loading={unblock.isPending}
        onConfirm={() => target && unblock.mutate(target.id)}
      />
    </div>
  );
}

/** "Security Alerts": privilege escalation threats and blocked hosts. */
export default function SecurityAlertsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={t('Security Alerts')}
        description={t(
          'Accounts refused repeatedly on admin routes. Their sessions are ended automatically; you decide whether to block the host.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Security Alerts') }]}
      />
      <Alert variant="info" className="mb-4">
        <ShieldAlert className="me-1 inline size-4" aria-hidden="true" />
        {t(
          'Administrator accounts are never ended or blocked automatically. Loopback addresses (this machine) are never blocked.',
        )}
      </Alert>
      <Tabs defaultValue="alerts">
        <TabsList aria-label={t('Security sections')}>
          <TabsTrigger value="alerts">{t('Alerts')}</TabsTrigger>
          <TabsTrigger value="blocked">{t('Blocked hosts')}</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts">
          <AlertsTab />
        </TabsContent>
        <TabsContent value="blocked">
          <BlockedTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
