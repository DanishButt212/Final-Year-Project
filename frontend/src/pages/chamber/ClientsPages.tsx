import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { chamberApi } from '@/lib/chamber-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate, formatPkr } from '@/lib/format';
import { CNIC_REGEX, MESSAGES, PHONE_REGEX, summaryFor } from '@/lib/schemas';
import { NotFoundPage } from '@/pages/ErrorPages';
import { RetainerBadge } from './shared';
import { balanceText, todayInput } from './helpers';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const CASE_TYPES = [
  msg('Civil Suit'),
  msg('Criminal Appeal'),
  msg('Writ Petition'),
  msg('Bail Application'),
  msg('Family Law'),
  msg('Property Matter'),
  msg('Other'),
];

const required = z.string().trim().min(1, MESSAGES.fieldRequired);
const schema = z.object({
  name: required,
  cnic: required.regex(CNIC_REGEX, 'CNIC must be in the format 12345-1234567-1.'),
  phone: required.regex(PHONE_REGEX, 'Phone must be in the format +92 3XX XXXXXXX.'),
  caseType: required,
  onboardedOn: required,
});
type Values = z.infer<typeof schema>;

/** "Register New Chamber Client Account" */
export function NewClientPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', cnic: '', phone: '', caseType: '', onboardedOn: todayInput() },
  });

  const create = useMutation({
    mutationFn: chamberApi.createClient,
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
      navigate(`/lawyer/chamber/clients/${res.client.id}`);
    },
    onError: (e) =>
      setFormError(
        applyServerError(e, setError, ['name', 'cnic', 'phone', 'caseType', 'onboardedOn']),
      ),
  });

  return (
    <>
      <PageHeader
        title={t('Register New Chamber Client Account')}
        description={t('The client profile ID is generated for this chamber only.')}
        crumbs={[
          { label: t('Dashboard'), to: '/lawyer' },
          { label: t('Client Directory'), to: '/lawyer/chamber/clients' },
          { label: t('New client') },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit(
              (v) => {
                setFormError(null);
                create.mutate(v);
              },
              (errs) => setFormError(summaryFor(errs)),
            )}
          >
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t('Client Name')} required error={errors.name?.message}>
                  {(p) => <Input maxLength={120} {...p} {...register('name')} />}
                </Field>
              </div>
              <Field
                label={t('CNIC Number')}
                required
                error={errors.cnic?.message}
                hint="12345-1234567-1"
              >
                {(p) => (
                  <Input
                    inputMode="numeric"
                    placeholder="12345-1234567-1"
                    {...p}
                    {...register('cnic')}
                  />
                )}
              </Field>
              <Field
                label={t('Primary Phone')}
                required
                error={errors.phone?.message}
                hint={t('+92 3XX XXXXXXX')}
              >
                {(p) => <PhoneInput {...p} {...register('phone')} />}
              </Field>
              <Field label={t('Case Type')} required error={errors.caseType?.message}>
                {(p) => (
                  <NativeSelect {...p} {...register('caseType')}>
                    <option value="">{t('Select a case type')}</option>
                    {CASE_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {t(ct)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field
                label={t('Initial Onboarding Date')}
                required
                error={errors.onboardedOn?.message}
              >
                {(p) => (
                  <Controller
                    control={control}
                    name="onboardedOn"
                    render={({ field }) => (
                      <DatePicker {...p} {...field} value={field.value ?? ''} />
                    )}
                  />
                )}
              </Field>
            </div>
            <Button type="submit" loading={create.isPending}>
              <UserPlus aria-hidden="true" /> {t('Create Client Internal File Record')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

/** Client Directory. The CNIC is masked here; the full number is only on the client page. */
export function ClientsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'clients', page, search],
    queryFn: () => chamberApi.clients({ page, limit: 10, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('Client Directory')}
        description={t('Clients of your chamber. Other chambers never see these records.')}
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Client Directory') }]}
        actions={
          <Button asChild>
            <Link to="/lawyer/chamber/clients/new">
              <UserPlus aria-hidden="true" /> {t('New client')}
            </Link>
          </Button>
        }
      />
      <form
        role="search"
        className="mb-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(text.trim());
        }}
      >
        <Input
          aria-label={t('Search clients by name, client ID or phone')}
          placeholder={t('Search name, client ID or phone')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" /> {t('Search')}
        </Button>
      </form>
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t('No clients found')}
            description={t('Register a client to start billing time and tracking retainers.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Client directory')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Client ID')}</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>CNIC</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Case type')}</TableHead>
                  <TableHead className="text-end">{t('Retainer')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="case-number whitespace-nowrap">{c.clientCode}</TableCell>
                    <TableCell>
                      <Link to={`/lawyer/chamber/clients/${c.id}`} className="font-medium">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{c.cnic ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone ?? '—'}</TableCell>
                    <TableCell>{c.caseType ?? '—'}</TableCell>
                    <TableCell className="text-end">
                      <span className="me-2">{balanceText(c.balance)}</span>
                      <RetainerBadge status={c.status} />
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
    </>
  );
}

/** Client detail: profile, retainer summary, billing ledger and linked cases. */
export function ClientDetailPage() {
  const { t } = useTranslation();
  const { clientId } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ['chamber', 'client', clientId],
    queryFn: () => chamberApi.client(clientId as string),
    enabled: Boolean(clientId),
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

  const ledger = [
    ...data.billable.map((b) => ({
      key: `b-${b.id}`,
      date: b.workedOn,
      kind: t('Billable time'),
      text: `${b.hours} h × ${formatPkr(b.hourlyRate)}${b.description ? ` · ${b.description}` : ''}`,
      amount: b.amount,
      sign: '',
    })),
    ...data.transactions.map((tx) => ({
      key: `t-${tx.id}`,
      date: tx.createdAt,
      kind:
        tx.type === 'DEPOSIT'
          ? t('Retainer deposit')
          : tx.type === 'REFUND'
            ? t('Refund')
            : t('Deducted from retainer'),
      text: tx.reference ?? tx.note ?? '',
      amount: tx.amount,
      sign: tx.type === 'DEPOSIT' ? '+' : '-',
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <PageHeader
        title={data.name}
        crumbs={[
          { label: t('Dashboard'), to: '/lawyer' },
          { label: t('Client Directory'), to: '/lawyer/chamber/clients' },
          { label: data.clientCode },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link to="/lawyer/chamber/retainer">{t('Retainer accounts')}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Profile')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  t('Client ID'),
                  <span key="c" className="case-number">
                    {data.clientCode}
                  </span>,
                ],
                [
                  'CNIC',
                  <span key="n" className="font-mono">
                    {data.cnic ?? '—'}
                  </span>,
                ],
                [t('Primary phone'), data.phone ?? '—'],
                [t('Case type'), data.caseType ?? '—'],
                [t('Onboarded on'), formatDate(data.onboardedOn)],
                [t('Email'), data.email ?? '—'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-sm text-text-muted">{k}</dt>
                  <dd className="break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Retainer summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="flex justify-between">
              <span className="text-text-muted">{t('Total deposits')}</span>
              <span>{formatPkr(data.retainer.totalDeposits)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-text-muted">{t('Deducted billable costs')}</span>
              <span>{formatPkr(data.retainer.totalDeductions)}</span>
            </p>
            <p className="flex items-center justify-between border-t border-border pt-2 font-bold">
              <span>{t('Net remaining balance')}</span>
              <span className="flex items-center gap-2">
                {balanceText(data.retainer.balance)} <RetainerBadge status={data.retainer.status} />
              </span>
            </p>
            <p className="flex justify-between text-sm text-text-muted">
              <span>{t('Invoice total (all billable time)')}</span>
              <span>{formatPkr(data.invoiceTotal)}</span>
            </p>
            {data.alerts.length > 0 && (
              <p className="text-sm text-text-muted">
                {t('Last low balance alert: {{date}}', { date: formatDate(data.alerts[0].sentAt) })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('Linked cases')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.linkedCases.length === 0 ? (
            <p className="text-text-muted">
              {t('No cases are linked yet. Link a case when you record billable time.')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.linkedCases.map((c) => (
                <li key={c.id} className="py-2">
                  <Link to={`/lawyer/cases/${c.id}`} className="case-number font-medium">
                    {c.ucn}
                  </Link>{' '}
                  <span className="text-text-muted">
                    <bdi>{c.title}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('Billing ledger')}</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-text-muted">{t('No billing activity yet.')}</p>
          ) : (
            <Table aria-label={t('Billing ledger')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Entry')}</TableHead>
                  <TableHead>{t('Detail')}</TableHead>
                  <TableHead className="text-end">{t('Amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{l.kind}</Badge>
                    </TableCell>
                    <TableCell>{l.text}</TableCell>
                    <TableCell className="whitespace-nowrap text-end">
                      {l.sign}
                      {formatPkr(l.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
