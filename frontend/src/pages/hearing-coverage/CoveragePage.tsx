import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { msg } from '@/i18n';
import { api, parseApiError } from '@/lib/api';
import { formatDate, formatPkr } from '@/lib/format';
import { pkIsoDate } from '@/lib/pk-time';
import { absenceLabels, type AbsenceSummary } from '@/lib/hearing-absences';


const base = '/hearing-coverage';
const key = ['hearing-coverage'];
type Hearing = {
  id: string;
  caseId?: string;
  ucn?: string;
  title?: string;
  date: string;
  time: string | null;
  courtId?: string | null;
  courtroom: string | null;
  status?: string;
  lastSummons?: boolean;
};
type Chamber = { id: string; name: string; manager?: boolean };
type Person = { id: string; name: string; barNumber?: string };
type Request = {
  id: string;
  hearing: Hearing;
  original: string;
  substitute: string | null;
  status: keyof typeof statuses;
  hearingDate: string;
  chamberId: string | null;
  reason?: string;
  decisionNote?: string | null;
  accessToday?: boolean;
};
type Dashboard = { chambers: Chamber[]; requests: Request[]; incoming: Request[] };
type Absence = AbsenceSummary & {
  hearing: Hearing;
  hearingDate: string;
  reason: string;
};

const statuses = {
  NEEDS_NOMINEE: msg('Choose a nominee'),
  CHAMBER_PENDING: msg('Awaiting chamber allocation'),
  NOMINEE_PENDING: msg('Awaiting nominee acceptance'),
  READER_PENDING: msg('Awaiting Reader approval'),
  JUDGE_PENDING: msg('Awaiting judge approval'),
  APPROVED: msg('Approved'),
  REJECTED: msg('Rejected'),
  RESCHEDULE_REQUIRED: msg('New hearing date required'),
  RESCHEDULED: msg('Rescheduled'),
  SUPERSEDED: msg('Schedule changed'),
};
type Action = keyof typeof actions;
const actions = {
  NOMINATE: msg('Nominate substitute'),
  ALLOCATE: msg('Allocate substitute'),
  ACCEPT: msg('Accept nomination'),
  DECLINE: msg('Decline nomination'),
  READER_APPROVE: msg('Approve and forward to judge'),
  READER_REJECT: msg('Reject request'),
  JUDGE_APPROVE: msg('Approve substitution'),
  JUDGE_REJECT: msg('Reject request'),
};

function useChange<T>(fn: (values: T) => Promise<unknown>) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queries.invalidateQueries({ queryKey: key }),
  });
}

function HearingLabel({ hearing }: { hearing: Hearing }) {
  return (
    <p className="text-sm text-text-muted">
      {hearing.ucn && <bdi>{hearing.ucn} · </bdi>}
      <time dateTime={hearing.date}>{formatDate(hearing.date)}</time> {hearing.time}{' '}
      {hearing.courtroom}
    </p>
  );
}

function SchedulingLink({ hearing }: { hearing: Hearing }) {
  const { t } = useTranslation();
  const query = new URLSearchParams({ date: hearing.date, hearing: hearing.id });
  if (hearing.courtId) query.set('courtId', hearing.courtId);
  return (
    <Button asChild variant="secondary">
      <Link to={`/admin/hearings?${query}`}>{t('Open Bench Scheduling')}</Link>
    </Button>
  );
}

function ClashForm({ hearing, chambers }: { hearing: Hearing; chambers: Chamber[] }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState('');
  const report = useChange(() =>
    api.post(base, {
      hearingId: hearing.id,
      reason: reason.trim(),
      chamberId: sharing && sharing !== 'private' && !hearing.lastSummons ? sharing : undefined,
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Report a hearing clash')}</CardTitle>
        <HearingLabel hearing={hearing} />
      </CardHeader>
      <CardContent>
        {report.isSuccess ? (
          <Alert variant="success">{t('Hearing clash reported.')}</Alert>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              report.mutate();
            }}
          >
            {hearing.lastSummons && (
              <Alert variant="info">
                {t('This is a last-summons hearing. The Reader will assign a new hearing date.')}
              </Alert>
            )}
            <Field label={t('Reason for the clash')} required>
              {(p) => (
                <Textarea
                  {...p}
                  required
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
            {chambers.length > 0 && !hearing.lastSummons && (
              <Field
                label={t('Do you want to share this case with your chamber for this hearing?')}
                required
              >
                {(p) => (
                  <NativeSelect
                    {...p}
                    required
                    value={sharing}
                    onChange={(event) => setSharing(event.target.value)}
                  >
                    <option value="">{t('Select an option')}</option>
                    <option value="private">{t('No, nominate a lawyer privately')}</option>
                    {chambers.map((chamber) => (
                      <option key={chamber.id} value={chamber.id}>
                        {t('Yes, share with {{chamber}}', { chamber: chamber.name })}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}
            {report.error && <Alert variant="error">{parseApiError(report.error).message}</Alert>}
            <Button
              type="submit"
              loading={report.isPending}
              disabled={!reason.trim() || (chambers.length > 0 && !hearing.lastSummons && !sharing)}
            >
              {t('Report clash')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Nomination({ request, allocate }: { request: Request; allocate: boolean }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [candidate, setCandidate] = useState('');
  const candidates = useQuery({
    queryKey: [...key, 'candidates', request.id, search],
    queryFn: async () =>
      (await api.get<Person[]>(`${base}/requests/${request.id}/candidates`, { params: { search } }))
        .data,
  });
  const nominate = useChange(() =>
    api.post(`${base}/requests/${request.id}/actions`, {
      action: allocate ? 'ALLOCATE' : 'NOMINATE',
      candidateId: candidate,
    }),
  );
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        nominate.mutate();
      }}
    >
      <Field label={t('Find a lawyer by name or bar number')}>
        {(p) => (
          <Input
            {...p}
            value={search}
            maxLength={80}
            onChange={(event) => {
              setSearch(event.target.value);
              setCandidate('');
            }}
          />
        )}
      </Field>
      <Field label={t('Available lawyer')} required>
        {(p) => (
          <NativeSelect
            {...p}
            required
            value={candidate}
            onChange={(event) => setCandidate(event.target.value)}
          >
            <option value="">{t('Select a lawyer')}</option>
            {candidates.data?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} {person.barNumber}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {candidates.isPending && <Skeleton className="h-8" />}
      {candidates.error && <QueryError error={candidates.error} />}
      {candidates.data?.length === 0 && (
        <p className="text-sm text-text-muted">{t('No eligible lawyers found for this slot.')}</p>
      )}
      {nominate.error && <Alert variant="error">{parseApiError(nominate.error).message}</Alert>}
      <Button type="submit" disabled={!candidate} loading={nominate.isPending}>
        {t(actions[allocate ? 'ALLOCATE' : 'NOMINATE'])}
      </Button>
    </form>
  );
}

function Decision({ request, choices }: { request: Request; choices: Action[] }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<Action | ''>('');
  const [note, setNote] = useState('');
  const decision = useChange((chosen: Action) =>
    api.post(`${base}/requests/${request.id}/actions`, {
      action: chosen,
      note: note.trim() || undefined,
    }),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action) decision.mutate(action);
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label={t('Decision')} required>
        {(p) => (
          <NativeSelect
            {...p}
            required
            value={action}
            onChange={(event) => setAction(event.target.value as Action | '')}
          >
            <option value="">{t('Select an option')}</option>
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {t(actions[choice])}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {action && (action.includes('REJECT') || action === 'DECLINE') && (
        <Field label={t('Decision reason')} required={action.includes('REJECT')}>
          {(p) => (
            <Textarea
              {...p}
              required={action.includes('REJECT')}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      )}
      {decision.error && <Alert variant="error">{parseApiError(decision.error).message}</Alert>}
      <Button
        type="submit"
        loading={decision.isPending}
        disabled={!action || (action.includes('REJECT') && !note.trim())}
      >
        {t('Save decision')}
      </Button>
    </form>
  );
}

function RequestCard({
  request,
  mode,
  manager,
}: {
  request: Request;
  mode: 'lawyer' | 'incoming' | 'chamber' | 'reader' | 'judge';
  manager?: boolean;
}) {
  const { t } = useTranslation();
  const { status, hearing } = request;
  return (
    <Card data-testid={`coverage-request-${request.id}`}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{hearing.title ?? request.original}</CardTitle>
          <HearingLabel hearing={hearing} />
        </div>
        <Badge variant={status === 'APPROVED' ? 'decided' : 'pending'}>{t(statuses[status])}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {hearing.title && (
          <p>
            {t('Original lawyer')} · {request.original}
          </p>
        )}
        {request.substitute && (
          <p>
            {t('Substitute lawyer')} · {request.substitute}
          </p>
        )}
        {request.reason && <p className="whitespace-pre-wrap">{request.reason}</p>}
        {request.decisionNote && <Alert variant="info">{request.decisionNote}</Alert>}
        {mode === 'lawyer' && status === 'NEEDS_NOMINEE' && (
          <Nomination request={request} allocate={false} />
        )}
        {mode === 'chamber' && manager && status === 'CHAMBER_PENDING' && (
          <Nomination request={request} allocate />
        )}
        {mode === 'incoming' && status === 'NOMINEE_PENDING' && (
          <Decision request={request} choices={['ACCEPT', 'DECLINE']} />
        )}
        {mode === 'reader' && status === 'READER_PENDING' && (
          <Decision request={request} choices={['READER_APPROVE', 'READER_REJECT']} />
        )}
        {mode === 'judge' && status === 'JUDGE_PENDING' && (
          <Decision request={request} choices={['JUDGE_APPROVE', 'JUDGE_REJECT']} />
        )}
        {mode === 'reader' && status === 'RESCHEDULE_REQUIRED' && (
          <SchedulingLink hearing={hearing} />
        )}
        {mode === 'incoming' && request.accessToday && hearing.caseId && (
          <Button asChild variant="secondary">
            <Link to={`/lawyer/cases/${hearing.caseId}?tab=documents`}>
              {t('Open case documents')}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LastSummons({ hearing }: { hearing: Hearing }) {
  const { t } = useTranslation();
  const mark = useChange(() =>
    api.patch(`${base}/hearings/${hearing.id}/last-summons`, { lastSummons: !hearing.lastSummons }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Last summons')}</CardTitle>
        <HearingLabel hearing={hearing} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p>
          {hearing.lastSummons
            ? t('Marked as last summons')
            : t('Substitution is available for this hearing.')}
        </p>
        {mark.error && <Alert variant="error">{parseApiError(mark.error).message}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button loading={mark.isPending} onClick={() => mark.mutate()}>
            {hearing.lastSummons ? t('Remove last-summons marking') : t('Mark as last summons')}
          </Button>
          <SchedulingLink hearing={hearing} />
        </div>
      </CardContent>
    </Card>
  );
}

function AbsenceForm({ hearing, counsel }: { hearing: Hearing; counsel: Person[] }) {
  const { t } = useTranslation();
  const [lawyerId, setLawyer] = useState('');
  const [reason, setReason] = useState('');
  const save = useChange(async () => {
    await api.post(`${base}/absences`, {
      hearingId: hearing.id,
      lawyerId,
      reason: reason.trim(),
    });
    setLawyer('');
    setReason('');
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Record lawyer absence')}</CardTitle>
        <HearingLabel hearing={hearing} />
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label={t('Absent lawyer')} required>
            {(p) => (
              <NativeSelect
                {...p}
                required
                value={lawyerId}
                onChange={(event) => setLawyer(event.target.value)}
              >
                <option value="">{t('Select a lawyer')}</option>
                {counsel.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('Remarks')}>
            {(p) => (
              <Textarea
                {...p}
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          {save.error && <Alert variant="error">{parseApiError(save.error).message}</Alert>}
          <Button type="submit" loading={save.isPending} disabled={!lawyerId}>
            {t('Mark absent')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AbsenceCard({ absence, reader }: { absence: Absence; reader: boolean }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const fine = useChange(() => api.post(`${base}/absences/${absence.id}/fine`, { amount }));
  const decide = useChange((fineRequired: boolean) =>
    api.post(`${base}/absences/${absence.id}/decision`, { fineRequired }),
  );
  return (
    <Card data-testid={`hearing-absence-${absence.id}`}>
      <CardHeader>
        <CardTitle>{absence.lawyer}</CardTitle>
        <HearingLabel hearing={{ ...absence.hearing, date: absence.hearingDate }} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p>{t(absenceLabels[absence.status])}{absence.amount && ` · ${formatPkr(absence.amount)}`}</p>
        {absence.reason && <p>{absence.reason}</p>}
        {!reader && absence.status === 'PENDING_DECISION' && (
          <>
            {decide.error && <Alert variant="error">{parseApiError(decide.error).message}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>{t('Impose Fine')}</Button>
              <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false)}>{t('No Fine')}</Button>
            </div>
          </>
        )}
        {reader && absence.status === 'AWAITING_FINE_AMOUNT' && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              fine.mutate();
            }}
          >
            <Field label={t('Fine amount (PKR)')} required>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              )}
            </Field>
            {fine.error && <Alert variant="error">{parseApiError(fine.error).message}</Alert>}
            <Button type="submit" loading={fine.isPending} disabled={!amount}>
              {t('Confirm Fine')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function MemberForm() {
  const { t } = useTranslation();
  const [barNumber, setBarNumber] = useState('');
  const add = useChange(async () => {
    await api.post(`${base}/chamber/members`, { barNumber: barNumber.trim() });
    setBarNumber('');
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Add chamber member')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <Field label={t('Bar number')} required>
            {(p) => (
              <Input
                {...p}
                required
                maxLength={40}
                value={barNumber}
                onChange={(event) => setBarNumber(event.target.value)}
              />
            )}
          </Field>
          {add.isSuccess && <Alert variant="success">{t('Chamber member added.')}</Alert>}
          {add.error && <Alert variant="error">{parseApiError(add.error).message}</Alert>}
          <Button type="submit" loading={add.isPending} disabled={!barNumber.trim()}>
            {t('Add member')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CoveragePage({ chamber = false }: { chamber?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const hearingId = params.get('hearing');
  const role = user?.role;
  const reader = role === 'ADMIN';
  const judge = role === 'JUDGE';
  const dashboard = useQuery({
    queryKey: [...key, role, chamber],
    queryFn: async () => (await api.get<Dashboard>(chamber ? `${base}/chamber` : base)).data,
  });
  const context = useQuery({
    queryKey: [...key, 'hearing', hearingId],
    enabled: Boolean(hearingId) && !chamber,
    queryFn: async () =>
      (
        await api.get<{ hearing: Hearing; chambers?: Chamber[]; counsel?: Person[] }>(
          `${base}/hearings/${hearingId}`,
        )
      ).data,
  });
  const absent = useQuery({
    queryKey: [...key, 'absences', role, hearingId],
    enabled: reader || judge,
    queryFn: async () =>
      (
        await api.get<Absence[]>(`${base}/absences`, {
          params: { hearingId: judge ? (hearingId ?? undefined) : undefined },
        })
      ).data,
  });
  const selected = context.data;
  const mode = chamber ? 'chamber' : reader ? 'reader' : judge ? 'judge' : 'lawyer';
  return (
    <div className="space-y-5">
      <PageHeader
        title={chamber ? t('Chamber Portal') : t('Hearing clashes and coverage')}
        actions={
          role === 'LAWYER' && (
            <Button asChild variant="secondary">
              <Link to={chamber ? '/lawyer/chamber' : '/chamber'}>
                {chamber ? t('Chamber management') : t('Chamber Portal')}
              </Link>
            </Button>
          )
        }
      />
      {context.error && <QueryError error={context.error} />}
      {selected && !reader && !judge && (
        <ClashForm
          key={selected.hearing.id}
          hearing={selected.hearing}
          chambers={selected.chambers ?? []}
        />
      )}
      {selected && reader && <LastSummons hearing={selected.hearing} />}
      {selected &&
        judge &&
        selected.hearing.status !== 'CANCELLED' &&
        selected.hearing.date <= pkIsoDate() && (
          <AbsenceForm
            key={selected.hearing.id}
            hearing={selected.hearing}
            counsel={selected.counsel ?? []}
          />
        )}
      {dashboard.isPending && <Skeleton className="h-32" />}
      {dashboard.error && <QueryError error={dashboard.error} />}
      {chamber && dashboard.data?.chambers.some((c) => c.manager) && <MemberForm />}
      {chamber && dashboard.data?.chambers.length ? (
        <p>{dashboard.data.chambers.map((c) => c.name).join(' · ')}</p>
      ) : null}
      {dashboard.data?.requests.length === 0 && (
        <Alert variant="info">{t('No hearing clash requests to show.')}</Alert>
      )}
      {dashboard.data?.requests.map((request) => (
        <RequestCard
          key={`${request.id}:${request.status}`}
          request={request}
          mode={mode}
          manager={dashboard.data.chambers.some((c) => c.id === request.chamberId && c.manager)}
        />
      ))}
      {!!dashboard.data?.incoming.length && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t('Substitute invitations and assignments')}</h2>
          {dashboard.data.incoming.map((request) => (
            <RequestCard
              key={`${request.id}:${request.status}`}
              request={request}
              mode="incoming"
            />
          ))}
        </section>
      )}
      {absent.error && <QueryError error={absent.error} />}
      {!!absent.data?.length && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t('Lawyer absences')}</h2>
          {absent.data.map((item) => (
            <AbsenceCard key={item.id} absence={item} reader={reader} />
          ))}
        </section>
      )}
    </div>
  );
}
