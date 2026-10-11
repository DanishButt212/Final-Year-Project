import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Save } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { chamberApi } from '@/lib/chamber-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate, formatPkr } from '@/lib/format';
import { MESSAGES, summaryFor } from '@/lib/schemas';
import { todayInput, useClientOptions } from './helpers';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const HOURS_MESSAGE = msg('Hours must be in steps of 0.25, between 0.25 and 24.');
const schema = z.object({
  clientId: z.string().min(1, MESSAGES.fieldRequired),
  workedOn: z.string().min(1, MESSAGES.fieldRequired),
  hours: z
    .string()
    .min(1, MESSAGES.fieldRequired)
    .refine((v) => {
      const n = Number(v);
      return n >= 0.25 && n <= 24 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9;
    }, HOURS_MESSAGE),
  notes: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .min(3, msg('Detail notes must be 3 to 500 characters.'))
    .max(500, 'Detail notes must be 3 to 500 characters.'),
  rate: z
    .string()
    .refine(
      (v) => v === '' || (Number(v) >= 1 && Number(v) <= 1_000_000),
      'Rate must be between PKR 1 and PKR 1,000,000.',
    ),
  caseId: z.string(),
  charge: z.boolean(),
});
type Values = z.infer<typeof schema>;

const FIELDS = ['clientId', 'hours', 'notes', 'caseId', 'workedOn'];

/** "Billable Hours Ledger Matrix" */
export default function BillablePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clients = useClientOptions();
  const profile = useQuery({ queryKey: ['chamber', 'profile'], queryFn: chamberApi.profile });
  const cases = useQuery({ queryKey: ['chamber', 'cases'], queryFn: chamberApi.cases });
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [fClient, setFClient] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: '',
      workedOn: todayInput(),
      hours: '',
      notes: '',
      rate: '',
      caseId: '',
      charge: true,
    },
  });
  const hours = useWatch({ control, name: 'hours' });
  const rate = useWatch({ control, name: 'rate' });
  const defaultRate = profile.data ? Number(profile.data.defaultHourlyRatePkr) : 0;
  const effectiveRate = rate ? Number(rate) : defaultRate;
  const preview = Number(hours) > 0 ? Number(hours) * effectiveRate : 0;

  const list = useQuery({
    queryKey: ['chamber', 'billable', page, fClient, from, to],
    queryFn: () =>
      chamberApi.billable({
        page,
        limit: 10,
        clientId: fClient || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (v: Values) =>
      chamberApi.createBillable({
        clientId: v.clientId,
        hours: Number(v.hours),
        notes: v.notes.trim(),
        hourlyRate: v.rate ? Number(v.rate) : undefined,
        chargeAgainstRetainer: v.charge,
        caseId: v.caseId || undefined,
        workedOn: v.workedOn,
      }),
    onSuccess: async (res) => {
      setFormError(null);
      setSuccess(res.message);
      toast.success(res.message);
      reset({
        clientId: '',
        workedOn: todayInput(),
        hours: '',
        notes: '',
        rate: '',
        caseId: '',
        charge: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) => {
      setSuccess(null);
      setFormError(applyServerError(e, setError, FIELDS));
    },
  });

  return (
    <>
      <PageHeader
        title={t('Billable Hours Ledger Matrix')}
        description={t(
          'Record time against a client. The amount is the hours multiplied by the hourly rate.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Billable Hours') }]}
      />
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" aria-hidden="true" /> {t('Record billable time')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit(
              (v) => {
                setFormError(null);
                setSuccess(null);
                create.mutate(v);
              },
              (errs) => {
                setSuccess(null);
                setFormError(summaryFor(errs));
              },
            )}
          >
            {success && <Alert variant="success">{success}</Alert>}
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('Client')} required error={errors.clientId?.message}>
                {(p) => (
                  <NativeSelect {...p} {...register('clientId')}>
                    <option value="">{t('Select a client')}</option>
                    {clients.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.clientCode})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label={t('Date worked')} required error={errors.workedOn?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="workedOn"
                    render={({ field }) => (
                      <DatePicker {...p} {...field} value={field.value ?? ''} />
                    )}
                  />
                )}
              </Field>
              <Field
                label={t('Time (hours)')}
                required
                error={errors.hours?.message}
                hint={t('Steps of 0.25, for example 3.5')}
              >
                {(p) => (
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0.25"
                    max="24"
                    {...p}
                    {...register('hours')}
                  />
                )}
              </Field>
              <Field
                label={t('Hourly rate (PKR)')}
                error={errors.rate?.message}
                hint={t('Leave empty to use the chamber rate: {{pkr}}', {
                  pkr: formatPkr(defaultRate),
                })}
              >
                {(p) => (
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="1"
                    placeholder={String(defaultRate)}
                    {...p}
                    {...register('rate')}
                  />
                )}
              </Field>
              <div className="md:col-span-2">
                <Field label={t('Detail notes')} required error={errors.notes?.message}>
                  {(p) => (
                    <Textarea
                      rows={3}
                      maxLength={500}
                      placeholder={t('Drafting constitutional writ petition response')}
                      {...p}
                      {...register('notes')}
                    />
                  )}
                </Field>
              </div>
              <Field label={t('Linked case (optional)')}>
                {(p) => (
                  <NativeSelect {...p} {...register('caseId')}>
                    <option value="">{t('No linked case')}</option>
                    {cases.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ucn} · {c.title}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    {...register('charge')}
                  />
                  {t('Charge against retainer')}
                </label>
              </div>
            </div>
            <p
              className="rounded-md border border-border bg-primary-soft p-3 text-sm"
              aria-live="polite"
            >
              {t('Amount for this entry:')} <strong>{formatPkr(preview)}</strong>
              {Number(hours) > 0 && (
                <span className="text-text-muted">
                  {' '}
                  ({Number(hours)} h × {formatPkr(effectiveRate)})
                </span>
              )}
            </p>
            <Button type="submit" loading={create.isPending}>
              <Save aria-hidden="true" /> {t('Record billable time')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-xl font-bold">{t('Recorded entries')}</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label={t('Client')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={fClient}
              onChange={(e) => {
                setFClient(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All clients')}</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('From')}>
          {(p) => (
            <DatePicker
              {...p}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>
        <Field label={t('To')}>
          {(p) => (
            <DatePicker
              {...p}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>
      </div>
      {list.isError && <QueryError error={list.error} />}
      {list.isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : list.data && list.data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clock}
            title={t('No billable entries')}
            description={t('Entries you record will appear here with their totals.')}
          />
        </Card>
      ) : (
        list.data && (
          <>
            <Table aria-label={t('Billable entries')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Client')}</TableHead>
                  <TableHead>{t('Detail')}</TableHead>
                  <TableHead className="text-end">{t('Hours')}</TableHead>
                  <TableHead className="text-end">{t('Rate')}</TableHead>
                  <TableHead className="text-end">{t('Amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(b.workedOn)}</TableCell>
                    <TableCell>
                      {b.clientName}{' '}
                      <span className="case-number text-text-muted">{b.clientCode}</span>
                    </TableCell>
                    <TableCell>
                      {b.description}
                      {b.ucn && <span className="case-number text-text-muted"> · {b.ucn}</span>}
                    </TableCell>
                    <TableCell className="text-end">{Number(b.hours)}</TableCell>
                    <TableCell className="whitespace-nowrap text-end">
                      {formatPkr(b.hourlyRate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-end">
                      {formatPkr(b.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">
                    {t('Total for the current filters')}
                  </TableCell>
                  <TableCell className="text-end font-bold">
                    {Number(list.data.totals.hours)}
                  </TableCell>
                  <TableCell />
                  <TableCell className="whitespace-nowrap text-end font-bold">
                    {formatPkr(list.data.totals.amount)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <Pagination
              page={list.data.meta.page}
              totalPages={list.data.meta.totalPages}
              total={list.data.meta.total}
              onPageChange={setPage}
            />
          </>
        )
      )}
    </>
  );
}
