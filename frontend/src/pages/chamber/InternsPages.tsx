import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, GraduationCap, NotebookPen, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { PhoneInput } from '@/components/ui/phone-input';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
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
import { chamberApi, type InternRow, type LogStatus, type ResearchLog } from '@/lib/chamber-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { LawyerCertificateCard } from '@/pages/intern/CertificateCard';
import { CNIC_REGEX, MESSAGES, PHONE_REGEX, summaryFor } from '@/lib/schemas';
import { NotFoundPage } from '@/pages/ErrorPages';
import { todayInput } from './helpers';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const LOG_STATUS: Record<
  LogStatus,
  { variant: 'pending' | 'decided' | 'rejected'; label: string }
> = {
  SUBMITTED: { variant: 'pending', label: msg('Awaiting review') },
  APPROVED: { variant: 'decided', label: msg('Approved') },
  NEEDS_REVISION: { variant: 'rejected', label: msg('Needs revision') },
};

export function LogStatusBadge({ status }: { status: LogStatus }) {
  return <Badge variant={LOG_STATUS[status].variant}>{LOG_STATUS[status].label}</Badge>;
}

const required = z.string().trim().min(1, MESSAGES.fieldRequired);
const internSchema = z.object({
  firstName: required.max(50),
  lastName: required.max(50),
  cnic: required.regex(CNIC_REGEX, 'CNIC must be in the format 12345-1234567-1.'),
  email: required.email('Enter a valid email address.'),
  phone: required.regex(PHONE_REGEX, 'Phone must be in the format +92 3XX XXXXXXX.'),
  startDate: required,
});
type InternValues = z.infer<typeof internSchema>;

function AddInternDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; link: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors },
  } = useForm<InternValues>({
    resolver: zodResolver(internSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      cnic: '',
      email: '',
      phone: '',
      startDate: todayInput(),
    },
  });

  const create = useMutation({
    mutationFn: chamberApi.createIntern,
    onSuccess: async (res) => {
      setCreated({ name: res.intern.name, email: getValues('email'), link: res.resetLink });
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) =>
      setFormError(
        applyServerError(e, setError, [
          'firstName',
          'lastName',
          'cnic',
          'email',
          'phone',
          'startDate',
        ]),
      ),
  });

  const close = (o: boolean) => {
    if (!o) {
      reset();
      setCreated(null);
      setFormError(null);
      setCopied(false);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('Intern account created')}</DialogTitle>
              <DialogDescription>
                {t('{{name}} ({{email}}) can set a password with the link below.', {
                  name: created.name,
                  email: created.email,
                })}
              </DialogDescription>
            </DialogHeader>
            <Alert variant="error" title={t('Shown only once')}>
              {t(
                'The server keeps only a fingerprint of this link, so it cannot be shown again. Copy it now and give it to the intern. It is valid for 72 hours.',
              )}
            </Alert>
            <div className="mt-4 space-y-2">
              <label htmlFor="intern-link" className="block text-sm font-medium">
                {t('One-time password setup link')}
              </label>
              <div className="flex gap-2">
                <input
                  id="intern-link"
                  readOnly
                  value={created.link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(created.link);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? t('Copied') : t('Copy')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>{t('Done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(
              (v) => {
                setFormError(null);
                create.mutate(v);
              },
              (errs) => setFormError(summaryFor(errs)),
            )}
          >
            <DialogHeader>
              <DialogTitle>{t('Add intern account')}</DialogTitle>
              <DialogDescription>
                {t(
                  'The intern is registered under your chamber and sets their own password through a one-time link.',
                )}
              </DialogDescription>
            </DialogHeader>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('First name')} required error={errors.firstName?.message}>
                {(p) => <Input maxLength={50} {...p} {...register('firstName')} />}
              </Field>
              <Field label={t('Last name')} required error={errors.lastName?.message}>
                {(p) => <Input maxLength={50} {...p} {...register('lastName')} />}
              </Field>
              <Field label="CNIC" required error={errors.cnic?.message} hint="12345-1234567-1">
                {(p) => <Input inputMode="numeric" {...p} {...register('cnic')} />}
              </Field>
              <Field
                label={t('Phone')}
                required
                error={errors.phone?.message}
                hint={t('+92 3XX XXXXXXX')}
              >
                {(p) => <PhoneInput {...p} {...register('phone')} />}
              </Field>
              <Field label={t('Email')} required error={errors.email?.message}>
                {(p) => <Input type="email" {...p} {...register('email')} />}
              </Field>
              <Field label={t('Start date')} required error={errors.startDate?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="startDate"
                    render={({ field }) => (
                      <DatePicker {...p} {...field} value={field.value ?? ''} />
                    )}
                  />
                )}
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                {t('Cancel')}
              </Button>
              <Button type="submit" loading={create.isPending}>
                <UserPlus aria-hidden="true" /> {t('Create intern account')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const internStatusBadge = (s: InternRow['status']) => (
  <Badge variant={s === 'ACTIVE' ? 'decided' : s === 'SUSPENDED' ? 'pending' : 'rejected'}>
    {s === 'ACTIVE'
      ? msg('Active')
      : s === 'SUSPENDED'
        ? msg('Deactivated')
        : msg('Access revoked')}
  </Badge>
);

/** Intern list with add, deactivate and reactivate. */
export function InternsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [toggle, setToggle] = useState<InternRow | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'interns'],
    queryFn: chamberApi.interns,
  });

  const change = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'deactivate' | 'reactivate' }) =>
      chamberApi.internStatus(id, action),
    onSuccess: async (res) => {
      toast.success(res.message);
      setToggle(null);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) => {
      setToggle(null);
      toast.error(parseApiError(e).message);
    },
  });

  return (
    <>
      <PageHeader
        title={t('Interns')}
        description={t('Legal interns registered under your chamber.')}
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Interns') }]}
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden="true" /> {t('Add intern account')}
          </Button>
        }
      />
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={3} cols={6} />
      ) : data && data.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title={t('No interns yet')}
            description={t(
              'Add an intern account to give an apprentice access to the research diary and attendance.',
            )}
          />
        </Card>
      ) : (
        data && (
          <Table aria-label={t('Interns')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Intern')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className="text-end">{t('Days this month')}</TableHead>
                <TableHead className="text-end">{t('Research logs')}</TableHead>
                <TableHead>{t('Last check-in')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link to={`/lawyer/chamber/interns/${i.id}`} className="font-medium">
                      {i.name}
                    </Link>
                    <p className="text-sm text-text-muted">{i.email}</p>
                  </TableCell>
                  <TableCell>{internStatusBadge(i.status)}</TableCell>
                  <TableCell className="text-end">{i.daysThisMonth}</TableCell>
                  <TableCell className="text-end">
                    {i.entries}
                    {i.pendingReviews > 0 && (
                      <span className="text-text-muted">
                        {' '}
                        {t('({{pendingReviews}} to review)', { pendingReviews: i.pendingReviews })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(i.lastCheckInAt)}
                  </TableCell>
                  <TableCell>
                    {(i.status === 'ACTIVE' || i.status === 'SUSPENDED') && (
                      <Button size="sm" variant="secondary" onClick={() => setToggle(i)}>
                        {i.status === 'ACTIVE' ? t('Deactivate') : t('Reactivate')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
      <AddInternDialog open={adding} onOpenChange={setAdding} />
      {toggle && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setToggle(null)}
          title={
            toggle.status === 'ACTIVE' ? t('Deactivate this intern?') : t('Reactivate this intern?')
          }
          description={
            toggle.status === 'ACTIVE'
              ? t(
                  '{{name}} will not be able to log in until you reactivate the account. Their records are kept.',
                  { name: toggle.name },
                )
              : t('{{name}} will be able to log in again.', { name: toggle.name })
          }
          confirmLabel={toggle.status === 'ACTIVE' ? t('Deactivate') : t('Reactivate')}
          destructive={toggle.status === 'ACTIVE'}
          loading={change.isPending}
          onConfirm={() =>
            change.mutate({
              id: toggle.id,
              action: toggle.status === 'ACTIVE' ? 'deactivate' : 'reactivate',
            })
          }
        />
      )}
    </>
  );
}

/** One intern: attendance days and recent research logs. */
export function InternDetailPage() {
  const { t } = useTranslation();
  const { internId } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ['chamber', 'intern', internId],
    queryFn: () => chamberApi.intern(internId as string),
    enabled: Boolean(internId),
    retry: false,
  });
  if (isPending) return <Skeleton className="h-96" />;
  if (error || !data) {
    return !data && parseApiError(error).statusCode !== 404 ? (
      <QueryError error={error} />
    ) : (
      <NotFoundPage />
    );
  }
  return (
    <>
      <PageHeader
        title={data.name}
        description={`${data.email} · ${data.phone} · started ${formatDate(data.startDate)}`}
        crumbs={[
          { label: t('Dashboard'), to: '/lawyer' },
          { label: t('Interns'), to: '/lawyer/chamber/interns' },
          { label: data.name },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link to={`/lawyer/chamber/research-logs?intern=${data.id}`}>
              {t('All research logs')}
            </Link>
          </Button>
        }
      />
      <LawyerCertificateCard internId={data.id} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('Attendance ({{length}} recent days)', { length: data.attendance.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.attendance.length === 0 ? (
              <p className="text-text-muted">{t('No attendance has been logged yet.')}</p>
            ) : (
              <Table aria-label={t('Attendance')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('In')}</TableHead>
                    <TableHead>{t('Out')}</TableHead>
                    <TableHead>{t('Court')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(a.date)}</TableCell>
                      <TableCell>{formatDateTime(a.checkInAt).slice(11)}</TableCell>
                      <TableCell>
                        {a.checkOutAt ? formatDateTime(a.checkOutAt).slice(11) : '—'}
                      </TableCell>
                      <TableCell>
                        {a.court ?? '—'}{' '}
                        {a.verified && <Badge variant="decided">{t('Verified')}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('Recent research logs ({{entries}} in total)', { entries: data.entries })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentLogs.length === 0 ? (
              <p className="text-text-muted">{t('No research logs yet.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentLogs.map((l) => (
                  <li key={l.id} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="case-number font-medium">{l.ucn ?? t('No case')}</span>
                      <LogStatusBadge status={l.status} />
                    </div>
                    <p className="text-sm">{l.citation}</p>
                    <p className="text-sm text-text-muted">{l.keywords.join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ReviewDialog({ log, onClose }: { log: ResearchLog; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const review = useMutation({
    mutationFn: (status: 'APPROVED' | 'NEEDS_REVISION') =>
      chamberApi.review(log.id, { status, comment: comment.trim() || undefined }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
      onClose();
    },
    onError: (e) => setError(parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Review research log')}</DialogTitle>
          <DialogDescription>
            {log.internName} · {log.ucn ?? t('No case')} · {formatDate(log.entryDate)}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-text-muted">{t('Citation reference')}</dt>
            <dd className="font-medium">{log.citation}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t('Keywords')}</dt>
            <dd>{log.keywords.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t('Relevant law notes')}</dt>
            <dd className="whitespace-pre-wrap">{log.notes}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <Field label={t('Comment (optional)')}>
            {(p) => (
              <Textarea
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={review.isPending}
            onClick={() => review.mutate('NEEDS_REVISION')}
          >
            {t('Needs revision')}
          </Button>
          <Button
            type="button"
            loading={review.isPending}
            onClick={() => review.mutate('APPROVED')}
          >
            <Check aria-hidden="true" /> {t('Approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Review queue and the chamber knowledge base: search the logs of all interns. */
export function ResearchReviewPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initialIntern = params.get('intern') ?? '';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | LogStatus>('');
  const [internId, setInternId] = useState(initialIntern);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ResearchLog | null>(null);

  const interns = useQuery({ queryKey: ['chamber', 'interns'], queryFn: chamberApi.interns });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'logs', page, status, internId, q],
    queryFn: () =>
      chamberApi.logs({
        page,
        limit: 10,
        status: status || undefined,
        internId: internId || undefined,
        q: q || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('Research Log Review')}
        description={t(
          "Review your interns' research logs. Search by keyword, case number or citation to use them as a knowledge base.",
        )}
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Research Logs') }]}
      />
      <form
        role="search"
        className="mb-4 grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(text.trim());
        }}
      >
        <div className="md:col-span-2">
          <Field label={t('Search keyword, case number or citation')}>
            {(p) => <Input value={text} onChange={(e) => setText(e.target.value)} {...p} />}
          </Field>
        </div>
        <Field label={t('Status')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | LogStatus);
                setPage(1);
              }}
            >
              <option value="">{t('All statuses')}</option>
              <option value="SUBMITTED">{t('Awaiting review')}</option>
              <option value="APPROVED">{t('Approved')}</option>
              <option value="NEEDS_REVISION">{t('Needs revision')}</option>
            </NativeSelect>
          )}
        </Field>
        <Field label={t('Intern')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={internId}
              onChange={(e) => {
                setInternId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All interns')}</option>
              {interns.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <div>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" /> {t('Search')}
          </Button>
        </div>
      </form>
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={4} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={NotebookPen}
            title={t('No research logs found')}
            description={t('Logs submitted by your interns appear here.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Research logs')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Intern')}</TableHead>
                  <TableHead>{t('Case')}</TableHead>
                  <TableHead>{t('Citation and keywords')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(l.entryDate)}</TableCell>
                    <TableCell>{l.internName}</TableCell>
                    <TableCell className="case-number whitespace-nowrap">{l.ucn ?? '—'}</TableCell>
                    <TableCell>
                      <p className="font-medium">{l.citation}</p>
                      <p className="text-sm text-text-muted">{l.keywords.join(', ')}</p>
                    </TableCell>
                    <TableCell>
                      <LogStatusBadge status={l.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={l.status === 'SUBMITTED' ? 'primary' : 'secondary'}
                        onClick={() => setOpen(l)}
                      >
                        {l.status === 'SUBMITTED' ? t('Review') : t('View')}
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
      {open &&
        (open.status === 'SUBMITTED' ? (
          <ReviewDialog log={open} onClose={() => setOpen(null)} />
        ) : (
          <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
            <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('Research log')}</DialogTitle>
                <DialogDescription>
                  {open.internName} · {open.ucn ?? t('No case')} ·{' '}
                  <LogStatusBadge status={open.status} />
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-text-muted">{t('Citation reference')}</dt>
                  <dd className="font-medium">{open.citation}</dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('Keywords')}</dt>
                  <dd>{open.keywords.join(', ')}</dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('Relevant law notes')}</dt>
                  <dd className="whitespace-pre-wrap">{open.notes}</dd>
                </div>
                {open.reviewComment && (
                  <div>
                    <dt className="text-sm text-text-muted">{t('Your comment')}</dt>
                    <dd>{open.reviewComment}</dd>
                  </div>
                )}
              </dl>
              <DialogFooter>
                <Button onClick={() => setOpen(null)}>{t('Close')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ))}
    </>
  );
}
