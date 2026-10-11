import { AddToCalendar } from '@/components/hearing/AddToCalendar';
import { CopyButton } from '@/components/ui/copy-button';
import { CaseProgressPanel } from '@/components/case/CaseProgressPanel';
import { translateText } from '@/lib/server-messages';
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
import { DecisionBlock } from '@/pages/cases/DecisionBlock';
import SummonsPanel from '@/pages/cases/SummonsPanel';
import { DecideDialog, OutcomeDialog } from './JudgeActions';
import { vaultKey } from '@/lib/query-keys';
import VaultPanel from '@/pages/cases/VaultPanel';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { caseId } = useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<{ id: string; date: string } | null>(null);
  const [deciding, setDeciding] = useState(false);

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

  const todayIso = new Date().toISOString().slice(0, 10);
  const isDecided = data.status === 'DECIDED';
  const hasHeldHearing = (data.hearings ?? []).some(
    (h) => h.status !== 'CANCELLED' && h.date <= todayIso,
  );

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
          { label: t('Dashboard'), to: '/judge' },
          { label: t('My Allocated Cases'), to: '/judge/cases' },
          { label: data.ucn },
        ]}
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-3">
        <span className="case-number rounded-md border border-primary bg-primary-soft px-3 py-1 text-lg font-medium text-primary">
          {data.ucn}
        </span>
        <CopyButton value={data.ucn} label={t('Copy UCN')} />
        <StatusBadge status={data.status} />
        <span className="text-text-muted">{caseTypeLabel(data.caseType)}</span>
        {!isDecided && (
          <Button
            className="ms-auto"
            onClick={() => setDeciding(true)}
            disabled={!hasHeldHearing}
            title={hasHeldHearing ? undefined : t('Available after a hearing has taken place')}
          >
            <Gavel aria-hidden="true" /> {t('Decide case')}
          </Button>
        )}
      </div>
      {!isDecided && !hasHeldHearing && (
        <p className="-mt-3 mb-6 text-sm text-text-muted">
          {t('A case can be decided only after at least one hearing has taken place.')}
        </p>
      )}
      <CaseProgressPanel progress={data.progress} />
      <DecisionBlock decision={data.decision} />

      <Tabs defaultValue="overview">
        <TabsList aria-label={t('Case sections')}>
          <TabsTrigger value="overview">{t('Overview')}</TabsTrigger>
          <TabsTrigger value="parties">{t('Parties')}</TabsTrigger>
          <TabsTrigger value="hearings">{t('Hearings')}</TabsTrigger>
          <TabsTrigger value="summons">{t('Summons')}</TabsTrigger>
          <TabsTrigger value="vault">{t('Vault')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>{t('Case information')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label={t('Filing date')}>{formatDate(data.filingDate)}</Detail>
                <Detail label={t('Filed by')}>{data.filedBy}</Detail>
                <Detail label={t('Courtroom')}>{data.courtroom?.name ?? '—'}</Detail>
                <Detail label={t('Next hearing')}>
                  {data.nextHearing
                    ? `${formatDate(data.nextHearing.date)} at ${data.nextHearing.startTime ?? ''}`
                    : t('None scheduled')}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label={t('Relief sought')}>
                    <span className="whitespace-pre-wrap font-normal">
                      <bdi>{data.reliefSought}</bdi>
                    </span>
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
                  <p className="mt-1 font-semibold">
                    <bdi>{p.name}</bdi>
                  </p>
                  <p className="text-sm text-text-muted">
                    {[p.cnic, p.phone, p.address].filter(Boolean).join(' · ') ||
                      t('No further details')}
                  </p>
                  {p.hasCounsel && (
                    <p className="text-sm text-text-muted">{t('Represented by counsel')}</p>
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
                <p className="text-text-muted">{t('No hearings yet.')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.hearings?.map((h) => (
                    <li key={h.id} className="space-y-1 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {t('{{date}} at {{startTime}} · {{courtroom}}', {
                            date: formatDate(h.date),
                            startTime: h.startTime,
                            courtroom: h.courtroom,
                          })}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge
                            variant={
                              h.status === 'CANCELLED'
                                ? 'rejected'
                                : h.status === 'HELD'
                                  ? 'decided'
                                  : h.status === 'ADJOURNED'
                                    ? 'pending'
                                    : 'hearing'
                            }
                          >
                            {h.status === 'HELD'
                              ? t('Completed')
                              : h.status === 'ADJOURNED'
                                ? t('Adjourned')
                                : h.status === 'CANCELLED'
                                  ? t('Cancelled')
                                  : t('Scheduled')}
                          </Badge>
                          {h.status === 'SCHEDULED' && h.date >= todayIso && (
                            <AddToCalendar
                              hearing={{
                                id: h.id,
                                ucn: data.ucn,
                                date: h.date,
                                startTime: h.startTime,
                                courtroom: h.courtroom,
                                court: data.court?.name,
                              }}
                              casePath={`/judge/cases/${data.id}`}
                            />
                          )}
                          {!isDecided && h.status === 'SCHEDULED' && h.date <= todayIso && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setOutcomeFor({ id: h.id, date: h.date })}
                            >
                              {t('Record outcome')}
                            </Button>
                          )}
                        </span>
                      </div>
                      {h.orderNotes && (
                        <p className="text-sm text-text-muted">
                          {t('Order notes: {{orderNotes}}', { orderNotes: h.orderNotes })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.events.length > 0 && (
                <p className="mt-4 text-sm text-text-muted">
                  {t('Last event: {{description}} ({{dateTime}})', {
                    description: translateText(data.events[data.events.length - 1].description),
                    dateTime: formatDateTime(data.events[data.events.length - 1].createdAt),
                  })}
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
                <Gavel className="size-5 text-primary" aria-hidden="true" />{' '}
                {t('Lock evidence by order of the bench')}
              </CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'Tick the exhibits to lock, or leave all unticked to lock every unlocked exhibit. Locked exhibits can no longer be edited or deleted by the parties.',
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field
                label={t('Reason (order of the bench)')}
                required
                error={reasonError ?? undefined}
              >
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
                    return setReasonError(t('Please enter the reason for the order.'));
                  setReasonError(null);
                  setConfirm(true);
                }}
              >
                {selected.size === 0
                  ? t('Lock all unlocked exhibits')
                  : selected.size === 1
                    ? t('Lock 1 selected exhibit')
                    : t('Lock {{count}} selected exhibits', { count: selected.size })}
              </Button>
            </CardContent>
          </Card>
          <VaultPanel caseId={data.id} readOnly selection={{ ids: selected, toggle }} />
        </TabsContent>
      </Tabs>

      {outcomeFor && <OutcomeDialog hearing={outcomeFor} onClose={() => setOutcomeFor(null)} />}
      {deciding && (
        <DecideDialog caseId={data.id} ucn={data.ucn} onClose={() => setDeciding(false)} />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('Lock evidence by order of the bench?')}
        description={t(
          'This cannot be undone from the portal. The filer and the lawyers on the case are notified.',
        )}
        confirmLabel={t('Lock evidence')}
        loading={lock.isPending}
        onConfirm={() => lock.mutate()}
      />
    </>
  );
}
