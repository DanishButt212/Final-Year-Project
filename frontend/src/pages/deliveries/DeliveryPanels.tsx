import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import { msg } from '@/i18n';
import { parseApiError } from '@/lib/api';
import {
  DELIVERY_OUTCOMES,
  deliveriesApi,
  deliveryKeys,
  type Attempt,
  type Delivery,
  type DeliveryOutcome,
  type DeliveryStatus,
  type ReviewAction,
} from '@/lib/deliveries-api';
import { formatDate, formatDateTime } from '@/lib/format';
import { pkParts } from '@/lib/pk-time';
import { adminSummonsApi, type ProcessServerOption } from '@/lib/summons-api';

type Mode = 'admin' | 'judge' | 'server';
const statusLabels: Record<DeliveryStatus, string> = {
  ASSIGNED: msg('Assigned'),
  OUT_FOR_DELIVERY: msg('Out for Delivery'),
  REPORTED: msg('Report submitted'),
  CLARIFICATION_REQUESTED: msg('Clarification requested'),
  REVIEWED: msg('Reviewed'),
};
const outcomes: Record<DeliveryOutcome, string> = {
  DELIVERED: msg('Delivered'),
  UNAVAILABLE: msg('Recipient unavailable'),
  REFUSED: msg('Refused'),
  INCORRECT_ADDRESS: msg('Address incorrect or incomplete'),
};
const reviewLabels: Record<Attempt['reviews'][number]['action'], string> = {
  ACCEPT: msg('Report accepted'),
  REQUEST_CLARIFICATION: msg('Clarification requested'),
  CLARIFICATION_REPLY: msg('Clarification submitted'),
  RETRY: msg('Another attempt assigned'),
  FORWARD: msg('Forwarded to judge'),
};

function useDeliveryMutation<T>(action: (values: T) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: deliveryKeys });
    },
  });
}

function ServerOptions({ servers }: { servers: ProcessServerOption[] }) {
  const { t } = useTranslation();
  return (
    <>
      <option value="">{t('Select a process server')}</option>
      {servers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.badgeNumber})
        </option>
      ))}
    </>
  );
}

function AssignmentForm({ caseId, servers }: { caseId: string; servers: ProcessServerOption[] }) {
  const { t } = useTranslation();
  const options = useQuery({
    queryKey: ['delivery-options', caseId],
    queryFn: () => deliveriesApi.options(caseId),
  });
  const [documentId, setDocument] = useState('');
  const [recipientId, setRecipient] = useState('');
  const [address, setAddress] = useState('');
  const [serverId, setServer] = useState('');
  const [due, setDue] = useState<string>();
  const assign = useDeliveryMutation(async (dueDate: string) => {
    await deliveriesApi.assign(caseId, {
      documentId,
      recipientId,
      address: address.trim(),
      serverId,
      dueDate,
    });
    setRecipient('');
    setAddress('');
  }, t('Delivery assigned.'));

  if (options.isPending) return <Skeleton className="h-32" />;
  if (options.error) return <QueryError error={options.error} />;
  const { documents, recipients, hearingDate } = options.data;
  const dueDate = due ?? options.data.dueDate;
  if (!documents.length)
    return <Alert variant="info">{t('Attach a case document before assigning a delivery.')}</Alert>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Assign document delivery')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            assign.mutate(dueDate);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Document')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={documentId}
                  onChange={(event) => setDocument(event.target.value)}
                >
                  <option value="">{t('Select a case document')}</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Recipient')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={recipientId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setRecipient(id);
                    setAddress(recipients.find((recipient) => recipient.id === id)?.address ?? '');
                  }}
                >
                  <option value="">{t('Select a recipient')}</option>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Process Server')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={serverId}
                  onChange={(event) => setServer(event.target.value)}
                >
                  <ServerOptions servers={servers} />
                </NativeSelect>
              )}
            </Field>
            <Field label={t('Due date')} required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDue(event.target.value)}
                />
              )}
            </Field>
          </div>
          {hearingDate && (
            <p>
              {t('Hearing date')} <time dateTime={hearingDate}>{formatDate(hearingDate)}</time>
            </p>
          )}
          <Field label={t('Confirm delivery address')} required>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                maxLength={600}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            )}
          </Field>
          {assign.error && <Alert variant="error">{parseApiError(assign.error).message}</Alert>}
          <Button
            type="submit"
            loading={assign.isPending}
            disabled={!documentId || !recipientId || !address.trim() || !serverId || !dueDate}
          >
            {t('Assign delivery')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AttemptHistory({ delivery, mode }: { delivery: Delivery; mode: Mode }) {
  const { t } = useTranslation();
  if (!delivery.attempts.length) return null;
  return (
    <section aria-label={t('Delivery attempt history')} className="space-y-2">
      <h3 className="font-semibold">{t('Delivery attempt history')}</h3>
      {delivery.attempts.map((attempt) => (
        <details
          key={attempt.id}
          className="rounded-md border border-border p-3"
          open={attempt === delivery.attempts[0]}
        >
          <summary className="cursor-pointer font-medium">
            {t(outcomes[attempt.outcome])} · {formatDateTime(attempt.occurredAt)}
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              {t('Process Server')} · {attempt.server.firstName} {attempt.server.lastName}
            </p>
            <p className="whitespace-pre-wrap">{attempt.address}</p>
            {attempt.receivedBy && (
              <p>
                {t('Received by')} · {attempt.receivedBy}
              </p>
            )}
            {attempt.reason && (
              <p className="whitespace-pre-wrap">
                {t('Reason')} · {attempt.reason}
              </p>
            )}
            {attempt.remarks && (
              <p className="whitespace-pre-wrap">
                {t('Remarks')} · {attempt.remarks}
              </p>
            )}
            {attempt.acknowledgmentType && (
              <PreviewButton
                label={t('View acknowledgment')}
                file={{
                  path: deliveriesApi.filePath(mode, delivery.id, attempt.id),
                  name: `acknowledgment.${attempt.acknowledgmentType === 'application/pdf' ? 'pdf' : attempt.acknowledgmentType === 'image/png' ? 'png' : 'jpg'}`,
                  kind: attempt.acknowledgmentType === 'application/pdf' ? 'pdf' : 'image',
                }}
              />
            )}
            {attempt.reviews.length > 0 && (
              <ul className="space-y-2 border-s-2 border-border ps-3">
                {attempt.reviews.map((review) => (
                  <li key={review.id}>
                    <p className="font-medium">{t(reviewLabels[review.action])}</p>
                    <p className="text-text-muted">
                      {review.actor.firstName} {review.actor.lastName} ·{' '}
                      {formatDateTime(review.createdAt)}
                    </p>
                    {review.note && <p className="whitespace-pre-wrap">{review.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}

function ReviewForm({ delivery, servers }: { delivery: Delivery; servers: ProcessServerOption[] }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<ReviewAction | ''>('');
  const [note, setNote] = useState('');
  const [address, setAddress] = useState(delivery.address);
  const [serverId, setServer] = useState(delivery.serverId);
  const [dueDate, setDueDate] = useState(delivery.dueDate);
  const review = useDeliveryMutation(
    (choice: ReviewAction) =>
      deliveriesApi.review(delivery, choice, {
        note: note.trim() || undefined,
        ...(choice === 'RETRY' ? { address: address.trim(), serverId, dueDate } : {}),
      }),
    t('Delivery review saved.'),
  );
  const latest = delivery.attempts[0];
  if (!latest || !['REPORTED', 'REVIEWED', 'CLARIFICATION_REQUESTED'].includes(delivery.status))
    return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action) review.mutate(action);
  }
  return (
    <form className="space-y-3 border-t border-border pt-4" onSubmit={submit}>
      <Field label={t('Review action')} required>
        {(p) => (
          <NativeSelect
            {...p}
            value={action}
            onChange={(event) => setAction(event.target.value as ReviewAction | '')}
          >
            <option value="">{t('Select a review action')}</option>
            {delivery.status === 'REPORTED' && (
              <>
                <option value="ACCEPT">{t('Accept report')}</option>
                <option value="REQUEST_CLARIFICATION">{t('Request clarification')}</option>
              </>
            )}
            <option value="RETRY">{t('Assign another attempt')}</option>
            {delivery.status === 'REVIEWED' &&
              !latest.reviews.some((r) => r.action === 'FORWARD') && (
                <option value="FORWARD">{t('Forward to judge')}</option>
              )}
          </NativeSelect>
        )}
      </Field>
      {action === 'RETRY' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Process Server')} required>
            {(p) => (
              <NativeSelect
                {...p}
                value={serverId}
                onChange={(event) => setServer(event.target.value)}
              >
                <ServerOptions servers={servers} />
              </NativeSelect>
            )}
          </Field>
          <Field label={t('Due date')} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('Confirm delivery address')} required>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  maxLength={600}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      )}
      {action && (
        <Field label={t('Review note')} required={action === 'REQUEST_CLARIFICATION'}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={3000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      )}
      {review.error && <Alert variant="error">{parseApiError(review.error).message}</Alert>}
      <Button
        type="submit"
        loading={review.isPending}
        disabled={
          !action ||
          (action === 'REQUEST_CLARIFICATION' && !note.trim()) ||
          (action === 'RETRY' && (!serverId || !address.trim() || !dueDate))
        }
      >
        {t('Submit review')}
      </Button>
    </form>
  );
}

function pakistanInputTime() {
  const { year, month, day, hour, minute } = pkParts(new Date());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function OfficerForm({ delivery }: { delivery: Delivery }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<DeliveryOutcome | ''>('');
  const [note, setNote] = useState('');
  const start = useDeliveryMutation(() => deliveriesApi.start(delivery), t('Delivery started.'));
  const report = useDeliveryMutation(
    (form: FormData) => deliveriesApi.report(delivery, form),
    t('Delivery report submitted.'),
  );
  const reply = useDeliveryMutation(
    () => deliveriesApi.reply(delivery, note.trim()),
    t('Clarification submitted'),
  );
  const error = start.error ?? report.error ?? reply.error;
  return (
    <>
      {error && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {delivery.status === 'ASSIGNED' && (
        <Button onClick={() => start.mutate()} loading={start.isPending}>
          {t('Mark out for delivery')}
        </Button>
      )}
      {delivery.status === 'OUT_FOR_DELIVERY' && (
        <form
          className="space-y-4 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set('occurredAt', new Date(`${form.get('occurredAt')}+05:00`).toISOString());
            const file = form.get('acknowledgment');
            if (file instanceof File && !file.size) form.delete('acknowledgment');
            report.mutate(form);
          }}
        >
          <Field label={t('Delivery outcome')} required>
            {(p) => (
              <NativeSelect
                {...p}
                name="outcome"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as DeliveryOutcome | '')}
              >
                <option value="">{t('Select an outcome')}</option>
                {DELIVERY_OUTCOMES.map((code) => (
                  <option key={code} value={code}>
                    {code === 'REFUSED'
                      ? t('Recipient refused to receive the document')
                      : t(outcomes[code])}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('Attempt date and time (Pakistan time)')} required>
            {(p) => (
              <Input
                {...p}
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={pakistanInputTime()}
              />
            )}
          </Field>
          {outcome === 'DELIVERED' && (
            <>
              <Field label={t('Received by')} required>
                {(p) => <Input {...p} name="receivedBy" required maxLength={160} />}
              </Field>
              <Field
                label={t('Acknowledgment (optional)')}
                hint={t('PDF, JPG or PNG, up to 5 MB.')}
              >
                {(p) => (
                  <Input
                    {...p}
                    name="acknowledgment"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                  />
                )}
              </Field>
            </>
          )}
          {outcome && outcome !== 'DELIVERED' && (
            <Field label={t('Reason')} required>
              {(p) => <Textarea {...p} name="reason" required maxLength={2000} rows={2} />}
            </Field>
          )}
          <Field label={t('Remarks')}>
            {(p) => <Textarea {...p} name="remarks" maxLength={3000} rows={3} />}
          </Field>
          <Button type="submit" loading={report.isPending} disabled={!outcome}>
            {t('Submit delivery report')}
          </Button>
        </form>
      )}
      {delivery.status === 'CLARIFICATION_REQUESTED' && (
        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            reply.mutate();
          }}
        >
          <Field label={t('Clarification reply')} required>
            {(p) => (
              <Textarea
                {...p}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={3000}
                rows={3}
              />
            )}
          </Field>
          <Button type="submit" loading={reply.isPending} disabled={!note.trim()}>
            {t('Submit clarification')}
          </Button>
        </form>
      )}
    </>
  );
}

function DeliveryCard({
  delivery,
  mode,
  servers,
}: {
  delivery: Delivery;
  mode: Mode;
  servers: ProcessServerOption[];
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap justify-between gap-2">
        <div>
          <p className="case-number text-text-muted">{delivery.ucn}</p>
          <CardTitle>{delivery.recipientName}</CardTitle>
          <p className="text-sm text-text-muted">{delivery.caseTitle}</p>
        </div>
        <Badge variant={delivery.status === 'REVIEWED' ? 'decided' : 'pending'}>
          {t(statusLabels[delivery.status])}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-text-muted">{t('Delivery address')}</dt>
            <dd className="whitespace-pre-wrap">{delivery.address}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t('Document')}</dt>
            <dd className="break-words">{delivery.documentName}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t('Due date')}</dt>
            <dd>{formatDate(delivery.dueDate)}</dd>
          </div>
          {delivery.hearingDate && (
            <div>
              <dt className="text-sm text-text-muted">{t('Hearing date')}</dt>
              <dd>{formatDate(delivery.hearingDate)}</dd>
            </div>
          )}
          {mode === 'admin' && (
            <div>
              <dt className="text-sm text-text-muted">{t('Process Server')}</dt>
              <dd>
                {delivery.server.firstName} {delivery.server.lastName}
              </dd>
            </div>
          )}
        </dl>
        <PreviewButton
          label={t('Open document')}
          file={{
            path: deliveriesApi.filePath(mode, delivery.id),
            name: delivery.documentName,
            kind: 'pdf',
          }}
        />
        <AttemptHistory delivery={delivery} mode={mode} />
        {mode === 'admin' && <ReviewForm delivery={delivery} servers={servers} />}
        {mode === 'server' && <OfficerForm delivery={delivery} />}
      </CardContent>
    </Card>
  );
}

export function DeliveryPanel({ mode, caseId }: { mode: Mode; caseId?: string }) {
  const { t } = useTranslation();
  const { data, error, isPending } = useQuery({
    queryKey: [...deliveryKeys, mode, caseId],
    queryFn: () => deliveriesApi.list(mode, caseId),
  });
  const officers = useQuery({
    queryKey: ['active-process-servers'],
    queryFn: () => adminSummonsApi.servers(),
    enabled: mode === 'admin',
  });
  const servers = officers.data ?? [];
  return (
    <div className="space-y-4">
      {mode === 'admin' && caseId && (
        <>
          {officers.isPending && <Skeleton className="h-24" />}
          {officers.error && <QueryError error={officers.error} />}
          {officers.data && <AssignmentForm caseId={caseId} servers={servers} />}
        </>
      )}
      {isPending && <Skeleton className="h-32" />}
      {error && <QueryError error={error} />}
      {data?.length === 0 && <Alert variant="info">{t('No document deliveries to show.')}</Alert>}
      {data?.map((delivery) => (
        <DeliveryCard
          key={`${delivery.id}:${delivery.version}`}
          delivery={delivery}
          mode={mode}
          servers={servers}
        />
      ))}
    </div>
  );
}

export function OfficerDeliveriesPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('Document Deliveries')} />
      <DeliveryPanel mode="server" />
    </>
  );
}
