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
import { securityApi, type SecurityAlert } from '@/lib/phase4e-api';

export const NOT_ENFORCED = 'Recorded, not enforced on local development hosts.';

const STATUS: Record<
  SecurityAlert['status'],
  { variant: 'rejected' | 'neutral' | 'decided'; label: string }
> = {
  OPEN: { variant: 'rejected', label: 'Open' },
  DISMISSED: { variant: 'neutral', label: 'Dismissed' },
  BLOCKED: { variant: 'decided', label: 'Host blocked' },
};

const refreshAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['admin', 'security'] });

function AlertDrawer({ id, onClose }: { id: string; onClose: () => void }) {
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
      title="Security alert"
      description="Privilege escalation threat"
    >
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <p>Loading...</p>
      ) : (
        data && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS[data.status].variant}>{STATUS[data.status].label}</Badge>
              {data.loopback && <Badge variant="neutral">Local development host</Badge>}
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="text-text-muted">Offending IP address</dt>
                <dd className="font-mono font-medium">{data.ip ?? 'unknown'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Account</dt>
                <dd className="font-medium">
                  {data.account
                    ? `${data.account.name ? `${data.account.name} · ` : ''}${data.account.email}`
                    : 'Not identified (forged or invalid token)'}
                  {data.role ? ` · ${data.role}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Action code</dt>
                <dd className="font-mono">{data.lastActionCode}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Last route</dt>
                <dd className="break-all font-mono">{data.lastRoute ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Refused attempts</dt>
                <dd className="font-medium">{data.attemptCount}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Raised</dt>
                <dd className="font-medium">{formatDateTime(data.createdAt)}</dd>
              </div>
              {data.resolvedAt && (
                <div>
                  <dt className="text-text-muted">Handled</dt>
                  <dd className="font-medium">
                    {formatDateTime(data.resolvedAt)}
                    {data.resolvedBy ? ` by ${data.resolvedBy}` : ''}
                  </dd>
                </div>
              )}
            </dl>
            {data.account?.id && (
              <p className="rounded-md border border-border bg-primary-soft p-2">
                The account&apos;s active sessions were ended when this alert was raised.
              </p>
            )}
            <section>
              <h3 className="mb-1 font-bold">Recent refused requests</h3>
              {data.events.length === 0 ? (
                <p className="text-text-muted">No raw events recorded.</p>
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
                    This is a local development address. Blocking is {NOT_ENFORCED.toLowerCase()}
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => setConfirm(true)}
                    disabled={!data.ip}
                  >
                    <Ban aria-hidden="true" /> Blacklist Client Host Address
                  </Button>
                  <Button
                    variant="secondary"
                    loading={dismiss.isPending}
                    onClick={() => dismiss.mutate()}
                  >
                    Dismiss alert
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
        title="Blacklist this host?"
        description={`All requests from ${data?.ip ?? 'this address'} will be refused with "Access denied." You can unblock it later under Blocked hosts.`}
        confirmLabel="Blacklist Client Host Address"
        destructive
        loading={blacklist.isPending}
        onConfirm={() => blacklist.mutate()}
      />
    </Drawer>
  );
}

function AlertsTab() {
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
        <Field label="Show alerts">
          {(p) => (
            <NativeSelect
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="OPEN">Open</option>
              <option value="BLOCKED">Host blocked</option>
              <option value="DISMISSED">Dismissed</option>
              <option value="">All</option>
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
            title="No alerts here"
            description="Alerts appear when an account is refused repeatedly on admin routes."
          />
        </Card>
      ) : (
        data && (
          <Table aria-label="Security alerts">
            <TableHeader>
              <TableRow>
                <TableHead>IP address</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Action code</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.ip ?? 'unknown'}</TableCell>
                  <TableCell>
                    {a.account ? a.account.email : 'Not identified'}
                    {a.role && <p className="text-xs text-text-muted">{a.role}</p>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.lastActionCode}</TableCell>
                  <TableCell className="text-right">{a.attemptCount}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setOpen(a.id)}>
                      Review
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
            title="No blocked hosts"
            description="Blacklisted addresses are listed here."
          />
        </Card>
      ) : (
        data && (
          <Table aria-label="Blocked hosts">
            <TableHeader>
              <TableRow>
                <TableHead>IP address</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Blocked</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Enforcement</TableHead>
                <TableHead>Action</TableHead>
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
                      <Badge variant="decided">Enforced</Badge>
                    ) : (
                      <span className="text-sm">{NOT_ENFORCED}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setTarget({ id: b.id, ip: b.ip })}
                    >
                      Unblock
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
        title="Unblock this host?"
        description={`${target?.ip ?? 'This address'} will be able to reach the system again.`}
        confirmLabel="Unblock host"
        loading={unblock.isPending}
        onConfirm={() => target && unblock.mutate(target.id)}
      />
    </div>
  );
}

/** "Security Alerts": privilege escalation threats and blocked hosts. */
export default function SecurityAlertsPage() {
  return (
    <>
      <PageHeader
        title="Security Alerts"
        description="Accounts refused repeatedly on admin routes. Their sessions are ended automatically; you decide whether to block the host."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Security Alerts' }]}
      />
      <Alert variant="info" className="mb-4">
        <ShieldAlert className="mr-1 inline size-4" aria-hidden="true" />
        Administrator accounts are never ended or blocked automatically. Loopback addresses (this
        machine) are never blocked.
      </Alert>
      <Tabs defaultValue="alerts">
        <TabsList aria-label="Security sections">
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="blocked">Blocked hosts</TabsTrigger>
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
