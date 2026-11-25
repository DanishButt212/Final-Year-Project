import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { msg } from '@/i18n';
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
import { toast } from '@/components/ui/toaster';
import { PreviewButton } from '@/components/viewer/PreviewButton';
import { parseApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  transcriptQuery,
  transcriptsApi,
  type TranscriptAssignment,
  type TranscriptHearing,
  type TranscriptStatus,
} from '@/lib/transcripts-api';

const statusLabels: Record<TranscriptStatus, string> = {
  DRAFT: msg('Draft'),
  SUBMITTED: msg('Submitted for Review'),
  RETURNED: msg('Returned for Correction'),
  APPROVED: msg('Approved'),
  SIGNED: msg('Signed'),
};

function TranscriptCard({
  hearing,
  mode,
}: {
  hearing: TranscriptHearing;
  mode: 'stenographer' | 'judge' | 'lawyer';
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState(hearing.text ?? '');
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const canEdit = mode === 'stenographer' && ['DRAFT', 'RETURNED'].includes(hearing.status);
  const dirty = text !== (hearing.text ?? '');
  const revision = hearing.revision;
  const name = `${hearing.ucn}-${hearing.date}.pdf`;

  const change = useMutation({
    mutationFn: async (action: 'save' | 'submit' | 'approve' | 'return' | 'sign') => {
      if (action === 'save') {
        await transcriptsApi.save(hearing.id, text, revision);
        return t('Draft saved.');
      }
      if (revision === null) throw new Error('Missing transcript revision');
      return transcriptsApi.transition(
        hearing.id,
        action,
        revision,
        action === 'return' ? note : undefined,
      );
    },
    onSuccess: async (message) => {
      setReturning(false);
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: transcriptQuery });
    },
  });

  async function download() {
    if (revision === null) return;
    setDownloading(true);
    try {
      await transcriptsApi.download(hearing.id, revision, name);
    } catch (error) {
      toast.error(parseApiError(error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <p className="case-number text-sm text-text-muted">{hearing.ucn}</p>
          <CardTitle>{hearing.title}</CardTitle>
          <p className="text-sm text-text-muted">
            {formatDate(hearing.date)} {hearing.time}
            {' · '}
            {hearing.judge.firstName} {hearing.judge.lastName}
          </p>
        </div>
        <Badge variant={hearing.status === 'SIGNED' ? 'decided' : 'pending'}>
          {t(statusLabels[hearing.status])}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {hearing.correctionNote && (
          <Alert variant="info" title={t('Correction note')}>
            <p className="whitespace-pre-wrap">{hearing.correctionNote}</p>
          </Alert>
        )}
        {change.error && <Alert variant="error">{parseApiError(change.error).message}</Alert>}
        {canEdit && (
          <Field label={t('Dictated statements')}>
            {(props) => (
              <Textarea
                {...props}
                rows={10}
                maxLength={60_000}
                value={text}
                disabled={change.isPending}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              onClick={() => change.mutate('save')}
              disabled={!dirty}
              loading={change.isPending}
            >
              {t('Save draft')}
            </Button>
          )}
          {revision !== null && !dirty && (
            <PreviewButton
              file={{ path: transcriptsApi.pdfPath(hearing.id, revision), kind: 'pdf', name }}
            />
          )}
          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => change.mutate('submit')}
              disabled={change.isPending || revision === null || dirty || !text.trim()}
            >
              {t('Submit for review')}
            </Button>
          )}
          {mode === 'judge' && hearing.status === 'SUBMITTED' && !returning && (
            <>
              <Button onClick={() => change.mutate('approve')} loading={change.isPending}>
                {t('Approve')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setReturning(true)}
                disabled={change.isPending}
              >
                {t('Return for correction')}
              </Button>
            </>
          )}
          {mode === 'judge' && hearing.status === 'APPROVED' && (
            <Button onClick={() => change.mutate('sign')} loading={change.isPending}>
              {t('Digitally sign and publish')}
            </Button>
          )}
          {hearing.status === 'SIGNED' && (
            <Button onClick={() => void download()} variant="secondary" loading={downloading}>
              {t('Download PDF')}
            </Button>
          )}
        </div>
        {returning && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              change.mutate('return');
            }}
          >
            <Field label={t('Correction note')} required>
              {(props) => (
                <Textarea
                  {...props}
                  maxLength={4000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={change.isPending}
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!note.trim()} loading={change.isPending}>
                {t('Return for correction')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={change.isPending}
                onClick={() => setReturning(false)}
              >
                {t('Cancel')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function TranscriptList({
  mode,
  caseId,
}: {
  mode: 'stenographer' | 'judge' | 'lawyer';
  caseId?: string;
}) {
  const { t } = useTranslation();
  const { data, isPending, error } = useQuery({
    queryKey: [...transcriptQuery, mode, caseId],
    queryFn: () => transcriptsApi.list(caseId),
  });
  if (isPending) return <Skeleton className="h-32" />;
  if (error) return <QueryError error={error} />;
  if (!data.length) return <Alert variant="info">{t('No hearing transcripts available.')}</Alert>;
  return (
    <div className="space-y-5">
      {data.map((hearing) => (
        <TranscriptCard key={`${hearing.id}:${hearing.revision}`} hearing={hearing} mode={mode} />
      ))}
    </div>
  );
}

export function StenographerPortal() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('Assigned hearings')} />
      <TranscriptList mode="stenographer" />
    </>
  );
}

export function JudgeTranscriptsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('Hearing transcripts')} />
      <TranscriptList mode="judge" />
    </>
  );
}

function AssignmentRow({
  hearing,
  stenographers,
}: {
  hearing: TranscriptAssignment;
  stenographers: { id: string; firstName: string; lastName: string }[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(hearing.stenographerId ?? '');
  const assignment = useMutation({
    mutationFn: () => transcriptsApi.assign(hearing.id, selected),
    onSuccess: async () => {
      toast.success(t('Stenographer assigned.'));
      await queryClient.invalidateQueries({ queryKey: ['transcript-assignments'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hearing.case.title}</CardTitle>
        <p className="text-sm text-text-muted">
          <bdi>{hearing.case.ucn}</bdi> · {formatDate(hearing.date)} {hearing.startTime}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label={t('Stenographer')}>
          {(props) => (
            <NativeSelect
              {...props}
              value={selected}
              disabled={Boolean(hearing.transcript) || assignment.isPending}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t('Select a stenographer')}</option>
              {stenographers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Button
          disabled={!selected || selected === hearing.stenographerId || Boolean(hearing.transcript)}
          loading={assignment.isPending}
          onClick={() => assignment.mutate()}
        >
          {t('Assign stenographer')}
        </Button>
        {assignment.error && (
          <Alert variant="error">{parseApiError(assignment.error).message}</Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function TranscriptAssignmentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const { data, isPending, error } = useQuery({
    queryKey: ['transcript-assignments', filter],
    queryFn: () => transcriptsApi.assignments(filter),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter(search.trim());
  }
  return (
    <>
      <PageHeader title={t('Stenographer assignments')} />
      <form onSubmit={submit} className="mb-5 flex max-w-xl items-end gap-3">
        <div className="flex-1">
          <Field label={t('Case number')}>
            {(props) => (
              <Input
                {...props}
                value={search}
                maxLength={80}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit">{t('Search')}</Button>
      </form>
      {isPending && <Skeleton className="h-32" />}
      {error && <QueryError error={error} />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.hearings.length === 0 && <Alert variant="info">{t('No hearings found.')}</Alert>}
          {data.hearings.map((hearing) => (
            <AssignmentRow
              key={`${hearing.id}:${hearing.stenographerId}`}
              hearing={hearing}
              stenographers={data.stenographers}
            />
          ))}
        </div>
      )}
    </>
  );
}
