import { QueryError } from '@/components/ui/query-error';
import { useViewer } from '@/components/viewer/viewer-context';
import { translateText } from '@/lib/server-messages';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollText, Search, ShieldCheck, ShieldAlert, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { DetailSkeleton, Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { adminApi } from '@/lib/admin-api';
import { parseApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { CNIC_REGEX } from '@/lib/schemas';
import {
  adminSummonsApi,
  type AdminSummons,
  type IssueInput,
  type NoticeType,
  type Priority,
} from '@/lib/summons-api';
import { OverdueBadge, PriorityBadge, SummonsStatusBadge } from '@/pages/server/badges';
import { useTranslation } from 'react-i18next';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ServerSelect({
  value,
  onChange,
  id,
  allowEmpty,
  sector,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  allowEmpty?: boolean;
  sector?: string;
}) {
  const { t } = useTranslation();
  const servers = useQuery({
    queryKey: ['admin', 'process-servers'],
    queryFn: () => adminSummonsApi.servers(),
  });
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">
        {allowEmpty ? t('Leave unassigned for now') : t('Choose a process server')}
      </option>
      {servers.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {t('{{name}} ({{badgeNumber}}) · {{sector}} · {{openWorkload}} open{{value}}', {
            name: s.name,
            badgeNumber: s.badgeNumber,
            sector: s.sector,
            openWorkload: s.openWorkload,
            value:
              sector && s.sector.toLowerCase() === sector.toLowerCase()
                ? ` · ${t('matches sector')}`
                : '',
          })}
        </option>
      ))}
    </NativeSelect>
  );
}

/** "Issue Summons" from an allocated case. */
function IssueDialog({
  initialCaseId,
  onClose,
}: {
  initialCaseId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [caseId, setCaseId] = useState(initialCaseId ?? '');
  const [caseSearch, setCaseSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [noticeType, setNoticeType] = useState<NoticeType>('SUMMONS');
  const [partyId, setPartyId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [cnic, setCnic] = useState('');
  const [address, setAddress] = useState('');
  const [sector, setSector] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [due, setDue] = useState('');
  const [serverId, setServerId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const found = useQuery({
    queryKey: ['admin', 'cases', 'for-summons', caseSearch],
    queryFn: () => adminApi.cases({ page: 1, limit: 30, search: caseSearch || undefined }),
    enabled: !initialCaseId,
  });
  const parties = useQuery({
    queryKey: ['admin', 'summons-parties', caseId],
    queryFn: () => adminSummonsApi.caseParties(caseId),
    enabled: Boolean(caseId),
  });

  function pickParty(id: string) {
    setPartyId(id);
    const p = parties.data?.parties.find((x) => x.id === id);
    if (p) {
      setRecipient(p.name);
      if (p.address) setAddress(p.address);
      if (p.cnic) setCnic(p.cnic);
    }
  }

  const issue = useMutation({
    mutationFn: (v: IssueInput) => adminSummonsApi.issue(v),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => {
      const body = parseApiError(e);
      const next: Record<string, string> = {};
      for (const d of body.details ?? []) next[d.field] = d.messages[0];
      setErrors(next);
      setFormError(body.message);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!caseId) next.caseId = t('Choose an allocated case.');
    if (!recipient.trim()) next.recipientName = t('Enter the recipient name.');
    if (cnic.trim() && !CNIC_REGEX.test(cnic.trim()))
      next.recipientCnic = t('CNIC must be in the format 12345-1234567-1.');
    if (address.trim().length < 10)
      next.serviceAddress = t('Enter the full service address (at least 10 characters).');
    if (!sector.trim()) next.sector = t('Enter the sector.');
    if (due && due < today()) next.dueDate = t('The due date must be today or later.');
    setErrors(next);
    if (Object.keys(next).length) return setFormError(t('Please correct the highlighted fields.'));
    setFormError(null);
    issue.mutate({
      caseId,
      noticeType,
      recipientName: recipient.trim(),
      recipientCnic: cnic.trim() || undefined,
      serviceAddress: address.trim(),
      sector: sector.trim(),
      priority,
      dueDate: due || undefined,
      assignedServerId: serverId || undefined,
      partyId: partyId || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !issue.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <form noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Issue Summons')}</DialogTitle>
            <DialogDescription>
              {t(
                'Issue a summons or notice for an allocated case and assign it to a process server.',
              )}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              {initialCaseId ? (
                <p className="rounded-md border border-border bg-primary-soft p-2 text-sm">
                  {t('Case:')}{' '}
                  <span className="case-number font-semibold">{parties.data?.ucn ?? '...'}</span>{' '}
                  {parties.data?.title}
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      aria-label={t('Search cases by number or title')}
                      placeholder={t('Search case number or title')}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCaseSearch(searchText.trim())}
                    >
                      <Search aria-hidden="true" /> {t('Search')}
                    </Button>
                  </div>
                  <Field label={t('Allocated case')} required error={errors.caseId}>
                    {(p) => (
                      <NativeSelect
                        {...p}
                        value={caseId}
                        onChange={(e) => {
                          setCaseId(e.target.value);
                          setPartyId('');
                        }}
                      >
                        <option value="">{t('Choose a case')}</option>
                        {found.data?.data
                          .filter((c) => c.judge)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.ucn} · {c.title}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                  </Field>
                </>
              )}
              {parties.data && !parties.data.allocated && (
                <Alert variant="error">{t('This case is not allocated to a bench yet.')}</Alert>
              )}
            </div>
            <Field label={t('Type')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={noticeType}
                  onChange={(e) => setNoticeType(e.target.value as NoticeType)}
                >
                  <option value="SUMMONS">{t('Summons')}</option>
                  <option value="NOTICE">{t('Notice')}</option>
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Priority')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  <option value="NORMAL">{t('Normal')}</option>
                  <option value="URGENT">{t('Urgent')}</option>
                </NativeSelect>
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('Party of the case (fills the recipient)')}>
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={partyId}
                    disabled={!parties.data}
                    onChange={(e) => pickParty(e.target.value)}
                  >
                    <option value="">{t('Enter the recipient manually')}</option>
                    {parties.data?.parties.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.role})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <Field label={t('Recipient name')} required error={errors.recipientName}>
              {(p) => (
                <Input
                  maxLength={120}
                  {...p}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('Recipient CNIC (optional)')}
              error={errors.recipientCnic}
              hint="12345-1234567-1"
            >
              {(p) => <Input {...p} value={cnic} onChange={(e) => setCnic(e.target.value)} />}
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('Service address')} required error={errors.serviceAddress}>
                {(p) => (
                  <Textarea
                    rows={2}
                    maxLength={300}
                    {...p}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field
              label={t('Sector')}
              required
              error={errors.sector}
              hint={t('For example Gulgasht Colony')}
            >
              {(p) => (
                <Input
                  maxLength={80}
                  {...p}
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('Due date')}
              error={errors.dueDate}
              hint={t('Empty uses the default period from System Policies.')}
            >
              {(p) => (
                <DatePicker
                  min={today()}
                  {...p}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('Process server')} error={errors.serverId}>
                {(p) => (
                  <ServerSelect
                    id={p.id}
                    value={serverId}
                    onChange={setServerId}
                    allowEmpty
                    sector={sector}
                  />
                )}
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={issue.isPending}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={issue.isPending}>
              <ScrollText aria-hidden="true" /> {t('Issue')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProofImage({
  id,
  kind,
  label,
}: {
  id: string;
  kind: 'photo' | 'signature';
  label: string;
}) {
  const { t } = useTranslation();
  const { open } = useViewer();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    adminSummonsApi
      .proofImage(id, kind)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, kind]);
  return (
    <figure>
      {url ? (
        <button
          type="button"
          onClick={() =>
            open({ path: `/admin/summons/${id}/proof/${kind}`, name: label, kind: 'image' })
          }
          className="block rounded-md"
          aria-label={t('Preview {{name}}', { name: label })}
        >
          <img
            src={url}
            alt={label}
            className="max-h-56 rounded-md border border-border bg-white object-contain"
          />
        </button>
      ) : failed ? (
        <p className="text-sm text-text-muted">{t('{{label}} could not be loaded.', { label })}</p>
      ) : (
        <Skeleton className="h-56 w-48" />
      )}
      <figcaption className="text-sm text-text-muted">{label}</figcaption>
    </figure>
  );
}

/** Detail dialog: attempts, proof, verify seal, reassign and cancel. */
function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newServer, setNewServer] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [verdict, setVerdict] = useState<{
    result: 'valid' | 'tampered';
    message: string;
    sealVersion: number;
  } | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'summons', 'detail', id],
    queryFn: () => adminSummonsApi.detail(id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  const assign = useMutation({
    mutationFn: () => adminSummonsApi.assign(id, newServer),
    onSuccess: async (r) => {
      toast.success(r.message);
      setNewServer('');
      await refresh();
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const cancel = useMutation({
    mutationFn: () => adminSummonsApi.cancel(id, reason.trim()),
    onSuccess: async (r) => {
      toast.success(r.message);
      setCancelling(false);
      await refresh();
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const verify = useMutation({
    mutationFn: () => adminSummonsApi.verify(id),
    onSuccess: (r) => setVerdict(r),
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const open =
    data &&
    (data.status === 'PENDING_ASSIGNMENT' ||
      data.status === 'ASSIGNED' ||
      data.status === 'ATTEMPT_IN_PROGRESS');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data
              ? `${data.noticeType === 'NOTICE' ? t('Notice') : t('Summons')} to ${data.recipientName}`
              : t('Summons')}
          </DialogTitle>
          <DialogDescription>{data ? `${data.ucn} · ${data.caseTitle}` : ''}</DialogDescription>
        </DialogHeader>
        {error && <QueryError error={error} />}
        {isPending ? (
          <DetailSkeleton />
        ) : (
          data && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <SummonsStatusBadge status={data.status} />
                <PriorityBadge priority={data.priority} />
                <OverdueBadge overdue={data.overdue} />
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-text-muted">{t('Service address')}</dt>
                  <dd className="font-medium">{data.serviceAddress}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Sector')}</dt>
                  <dd className="font-medium">{data.sector}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Recipient CNIC')}</dt>
                  <dd className="font-mono">{data.recipientCnic ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Due')}</dt>
                  <dd className="font-medium">{formatDate(data.dueBy)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Process server')}</dt>
                  <dd className="font-medium">
                    {data.server
                      ? `${data.server.name} (${data.server.badgeNumber})`
                      : t('Not assigned')}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Issued by')}</dt>
                  <dd className="font-medium">
                    {t('{{value}} on {{date}}', {
                      value: data.issuedBy ?? '—',
                      date: formatDate(data.issuedAt),
                    })}
                  </dd>
                </div>
                {data.cancelReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-text-muted">{t('Cancellation reason')}</dt>
                    <dd>{data.cancelReason}</dd>
                  </div>
                )}
              </dl>

              <section>
                <h3 className="mb-2 font-bold">{t('Attempt timeline')}</h3>
                {data.attempts.length === 0 ? (
                  <p className="text-text-muted">{t('No attempts logged.')}</p>
                ) : (
                  <ol className="space-y-2">
                    {data.attempts.map((a) => (
                      <li key={a.id} className="rounded-md border border-border p-2 text-sm">
                        <p className="font-semibold">
                          {formatDateTime(a.createdAt)}{' '}
                          <span className="font-normal text-text-muted">
                            · {a.latitude}, {a.longitude} (±{Math.round(Number(a.accuracyM))} m)
                          </span>
                        </p>
                        <p>{a.notes}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {data.proof && (
                <section className="space-y-3">
                  <h3 className="font-bold">{t('Execution proof')}</h3>
                  <p className="text-sm">
                    {t('{{value}} on {{dateTime}} at {{latitude}}, {{longitude}} (±{{round}} m).', {
                      value:
                        data.proof.serviceMode === 'PERSONAL_DELIVERY'
                          ? t('Delivered in person')
                          : t('Refused, affixed to gate'),
                      dateTime: formatDateTime(data.proof.executedAt),
                      latitude: data.proof.latitude,
                      longitude: data.proof.longitude,
                      round: Math.round(Number(data.proof.accuracyM)),
                    })}
                  </p>
                  <p className="text-sm">{data.proof.notes}</p>
                  <div className="flex flex-wrap gap-4">
                    {data.proof.hasPhoto && (
                      <ProofImage id={id} kind="photo" label={t('Photo of the served notice')} />
                    )}
                    {data.proof.hasSignature && (
                      <ProofImage id={id} kind="signature" label={t('Recipient signature')} />
                    )}
                  </div>
                  <p className="break-all font-mono text-xs text-text-muted">
                    {t('Seal: {{seal}}', { seal: data.proof.seal })}
                  </p>
                  <p className="text-xs text-text-muted">
                    {data.proof.sealVersion === 1
                      ? t('Seal version 1: covers the execution details, photo and signature.')
                      : t(
                          'Seal version 2: also covers the case number, recipient and service address.',
                        )}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => verify.mutate()}
                      loading={verify.isPending}
                    >
                      <ShieldCheck aria-hidden="true" /> {t('Verify seal')}
                    </Button>
                    {verdict && (
                      <Badge variant={verdict.result === 'valid' ? 'decided' : 'rejected'}>
                        {verdict.result === 'valid' ? t('Valid') : t('Tampered')}
                      </Badge>
                    )}
                  </div>
                  {verdict && (
                    <Alert variant={verdict.result === 'valid' ? 'success' : 'error'}>
                      {verdict.result === 'tampered' && (
                        <ShieldAlert className="me-1 inline size-4" aria-hidden="true" />
                      )}
                      {translateText(verdict.message)}{' '}
                      {t('(seal version {{version}})', { version: verdict.sealVersion })}
                    </Alert>
                  )}
                </section>
              )}

              {open && (
                <section className="space-y-3 border-t border-border pt-4">
                  <h3 className="font-bold">{data.server ? t('Reassign') : t('Assign')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-0 flex-1">
                      <ServerSelect
                        value={newServer}
                        onChange={setNewServer}
                        sector={data.sector}
                      />
                    </div>
                    <Button
                      onClick={() => assign.mutate()}
                      disabled={!newServer}
                      loading={assign.isPending}
                    >
                      {data.server ? t('Reassign') : t('Assign')}
                    </Button>
                  </div>
                  {cancelling ? (
                    <div className="space-y-2">
                      <Field
                        label={t('Reason for cancelling')}
                        required
                        error={reasonError ?? undefined}
                      >
                        {(p) => (
                          <Textarea
                            rows={2}
                            maxLength={300}
                            {...p}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        )}
                      </Field>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          loading={cancel.isPending}
                          onClick={() => {
                            if (reason.trim().length < 5)
                              return setReasonError(t('The reason must be 5 to 300 characters.'));
                            setReasonError(null);
                            cancel.mutate();
                          }}
                        >
                          {t('Cancel summons')}
                        </Button>
                        <Button variant="secondary" onClick={() => setCancelling(false)}>
                          {t('Keep it')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => setCancelling(true)}>
                      {t('Cancel this summons')}
                    </Button>
                  )}
                </section>
              )}
            </div>
          )
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUSES = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ATTEMPT_IN_PROGRESS',
  'EXECUTED',
  'CANCELLED',
] as const;

/** "Summons & Notices Registry" */
export default function SummonsRegistryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const issueCase = params.get('issue');
  const [issuing, setIssuing] = useState(Boolean(issueCase));
  const [open, setOpen] = useState<AdminSummons | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [serverId, setServerId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'summons', page, status, serverId, overdue, search],
    queryFn: () =>
      adminSummonsApi.list({
        page,
        limit: 10,
        status: status || undefined,
        serverId: serverId || undefined,
        overdue: overdue || undefined,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const servers = useQuery({
    queryKey: ['admin', 'process-servers'],
    queryFn: () => adminSummonsApi.servers(),
  });

  return (
    <>
      <PageHeader
        title={t('Summons & Notices Registry')}
        description={t(
          'Issue summons and notices for allocated cases and assign them to process servers.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Summons & Notices') }]}
        actions={
          <Button onClick={() => setIssuing(true)}>
            <Plus aria-hidden="true" /> {t('Issue Summons')}
          </Button>
        }
      />
      <form
        role="search"
        className="mb-4 grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(text.trim());
        }}
      >
        <div className="md:col-span-2">
          <Field label={t('Search case number or recipient')}>
            {(p) => <Input {...p} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('Status')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All statuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('Process server')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={serverId}
              onChange={(e) => {
                setServerId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All servers')}</option>
              {servers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={overdue}
            onChange={(e) => {
              setOverdue(e.target.checked);
              setPage(1);
            }}
          />
          {t('Overdue only')}
        </label>
        <div>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" /> {t('Search')}
          </Button>
        </div>
      </form>
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={5} cols={7} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={t('No summons found')}
            description={t('Issue a summons from an allocated case.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Summons registry')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Case')}</TableHead>
                  <TableHead>{t('Recipient')}</TableHead>
                  <TableHead>{t('Sector')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Due')}</TableHead>
                  <TableHead>{t('Server')}</TableHead>
                  <TableHead>{t('Action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link to={`/admin/cases/${s.caseId}`} className="case-number font-medium">
                        {s.ucn}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {s.recipientName}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <PriorityBadge priority={s.priority} />
                      </div>
                    </TableCell>
                    <TableCell>{s.sector}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <SummonsStatusBadge status={s.status} />
                        <OverdueBadge overdue={s.overdue} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(s.dueBy)}</TableCell>
                    <TableCell>{s.server ? s.server.name : '—'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="secondary" onClick={() => setOpen(s)}>
                        {t('Details')}
                      </Button>
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
      {issuing && (
        <IssueDialog
          initialCaseId={issueCase}
          onClose={() => {
            setIssuing(false);
            if (issueCase) setParams({}, { replace: true });
          }}
        />
      )}
      {open && <DetailDialog id={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}
