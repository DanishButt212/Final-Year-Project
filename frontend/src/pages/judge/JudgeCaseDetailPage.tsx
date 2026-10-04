import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gavel } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api, parseApiError } from '@/lib/api';
import type { CaseDetail } from '@/lib/cases-api';
import { caseTypeLabel } from '@/lib/case-status';
import { formatDate, formatDateTime } from '@/lib/format';
import { evidenceApi } from '@/lib/phase4-api';
import { NotFoundPage } from '@/pages/ErrorPages';
import SummonsPanel from '@/pages/cases/SummonsPanel';
import VaultPanel, { vaultKey } from '@/pages/cases/VaultPanel';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

/** Read-only case page for the allocated judge, with "Lock evidence by order of the bench". */
export default function JudgeCaseDetailPage() {
  const { caseId } = useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['judge', 'case', caseId],
    queryFn: async () => (await api.get<CaseDetail>(`/judge/cases/${caseId}`)).data,
    enabled: Boolean(caseId),
    retry: false,
  });

  const lock = useMutation({
    mutationFn: () =>
      evidenceApi.lock(caseId as string, {
        evidenceIds: selected.size > 0 ? [...selected] : undefined,
        reason: reason.trim(),
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      setConfirm(false);
      setSelected(new Set());
      setReason('');
      await queryClient.invalidateQueries({ queryKey: vaultKey(caseId as string) });
      await queryClient.invalidateQueries({ queryKey: ['judge', 'case', caseId] });
    },
    onError: (e) => {
      setConfirm(false);
      toast.error(parseApiError(e).message);
    },
  });

  if (isPending) return <Skeleton className="h-96" />;
  if (error || !data) {
    return parseApiError(error).statusCode === 404 || !data ? (
      <NotFoundPage />
    ) : (
      <Alert variant="error">{parseApiError(error).message}</Alert>
    );
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <>
      <PageHeader
        title={data.title}
        crumbs={[
          { label: 'Dashboard', to: '/judge' },
          { label: 'My Allocated Cases', to: '/judge/cases' },
          { label: data.ucn },
        ]}
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-3">
        <span className="case-number rounded-md border border-primary bg-primary-soft px-3 py-1 text-lg font-medium text-primary">
          {data.ucn}
        </span>
        <StatusBadge status={data.status} />
        <span className="text-text-muted">{caseTypeLabel(data.caseType)}</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList aria-label="Case sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="hearings">Hearings</TabsTrigger>
          <TabsTrigger value="summons">Summons</TabsTrigger>
          <TabsTrigger value="vault">Vault</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Case information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Filing date">{formatDate(data.filingDate)}</Detail>
                <Detail label="Filed by">{data.filedBy}</Detail>
                <Detail label="Courtroom">{data.courtroom?.name ?? '—'}</Detail>
                <Detail label="Next hearing">
                  {data.nextHearing
                    ? `${formatDate(data.nextHearing.date)} at ${data.nextHearing.startTime ?? ''}`
                    : 'None scheduled'}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Relief sought">
                    <span className="whitespace-pre-wrap font-normal">{data.reliefSought}</span>
                  </Detail>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parties">
          <div className="grid gap-4 md:grid-cols-2">
            {data.parties.map((p) => (
              <Card key={p.id}>
                <CardContent>
                  <Badge variant="neutral">{p.role}</Badge>
                  <p className="mt-1 font-semibold">{p.name}</p>
                  <p className="text-sm text-text-muted">
                    {[p.cnic, p.phone, p.address].filter(Boolean).join(' · ') ||
                      'No further details'}
                  </p>
                  {p.hasCounsel && (
                    <p className="text-sm text-text-muted">Represented by counsel</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="hearings">
          <Card>
            <CardContent>
              {(data.hearings ?? []).length === 0 ? (
                <p className="text-text-muted">No hearings yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.hearings?.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span>
                        {formatDate(h.date)} at {h.startTime} · {h.courtroom}
                      </span>
                      <Badge variant={h.status === 'CANCELLED' ? 'rejected' : 'hearing'}>
                        {h.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {data.events.length > 0 && (
                <p className="mt-4 text-sm text-text-muted">
                  Last event: {data.events[data.events.length - 1].description} (
                  {formatDateTime(data.events[data.events.length - 1].createdAt)})
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summons">
          <SummonsPanel caseId={data.id} ucn={data.ucn} judge />
        </TabsContent>

        <TabsContent value="vault" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="size-5 text-primary" aria-hidden="true" /> Lock evidence by order
                of the bench
              </CardTitle>
              <p className="text-sm text-text-muted">
                Tick the exhibits to lock, or leave all unticked to lock every unlocked exhibit.
                Locked exhibits can no longer be edited or deleted by the parties.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Reason (order of the bench)" required error={reasonError ?? undefined}>
                {(p) => (
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    {...p}
                  />
                )}
              </Field>
              <Button
                onClick={() => {
                  if (!reason.trim())
                    return setReasonError('Please enter the reason for the order.');
                  setReasonError(null);
                  setConfirm(true);
                }}
              >
                Lock {selected.size > 0 ? `${selected.size} selected` : 'all unlocked'} exhibit
                {selected.size === 1 ? '' : 's'}
              </Button>
            </CardContent>
          </Card>
          <VaultPanel caseId={data.id} readOnly selection={{ ids: selected, toggle }} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Lock evidence by order of the bench?"
        description="This cannot be undone from the portal. The filer and the lawyers on the case are notified."
        confirmLabel="Lock evidence"
        loading={lock.isPending}
        onConfirm={() => lock.mutate()}
      />
    </>
  );
}
