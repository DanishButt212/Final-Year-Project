import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Receipt, Save } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
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
import { MESSAGES, summaryFor } from '@/lib/schemas';
import { StatCard } from './shared';
import { todayInput } from './helpers';
import { useTranslation } from 'react-i18next';

const schema = z.object({
  spentOn: z.string().min(1, MESSAGES.fieldRequired),
  category: z.string().trim().min(1, MESSAGES.fieldRequired),
  amount: z
    .string()
    .min(1, MESSAGES.fieldRequired)
    .refine((v) => Number(v) >= 1, 'Amount must be at least PKR 1.'),
  note: z.string().trim().max(300, 'Note can be at most 300 characters.'),
});
type Values = z.infer<typeof schema>;

/** Chamber expenses: date, category, amount and note, with totals. */
export default function ExpensesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { spentOn: todayInput(), category: '', amount: '', note: '' },
  });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'expenses', page],
    queryFn: () => chamberApi.expenses({ page, limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (v: Values) =>
      chamberApi.createExpense({
        spentOn: v.spentOn,
        category: v.category.trim(),
        amount: Number(v.amount),
        note: v.note.trim() || undefined,
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      setFormError(null);
      reset({ spentOn: todayInput(), category: '', amount: '', note: '' });
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) =>
      setFormError(applyServerError(e, setError, ['spentOn', 'category', 'amount', 'note'])),
  });

  return (
    <>
      <PageHeader
        title={t('Chamber Expenses')}
        description={t('Office and case expenses of your chamber.')}
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Expenses') }]}
      />
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard
            label={t('Expenses this month')}
            value={formatPkr(data.totals.thisMonth)}
            icon={Receipt}
          />
          <StatCard
            label={t('All recorded expenses')}
            value={formatPkr(data.totals.all)}
            icon={Receipt}
          />
        </div>
      )}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t('Record an expense')}</CardTitle>
        </CardHeader>
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
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t('Date')} required error={errors.spentOn?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="spentOn"
                    render={({ field }) => (
                      <DatePicker {...p} {...field} value={field.value ?? ''} />
                    )}
                  />
                )}
              </Field>
              <Field label={t('Category')} required error={errors.category?.message}>
                {(p) => (
                  <Input
                    maxLength={60}
                    placeholder={t('Travel, stationery...')}
                    {...p}
                    {...register('category')}
                  />
                )}
              </Field>
              <Field label={t('Amount (PKR)')} required error={errors.amount?.message}>
                {(p) => (
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    inputMode="decimal"
                    {...p}
                    {...register('amount')}
                  />
                )}
              </Field>
              <div className="md:col-span-3">
                <Field label={t('Note')} error={errors.note?.message}>
                  {(p) => <Input maxLength={300} {...p} {...register('note')} />}
                </Field>
              </div>
            </div>
            <Button type="submit" loading={create.isPending}>
              <Save aria-hidden="true" /> {t('Save expense')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={4} cols={4} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={t('No expenses yet')}
            description={t('Recorded expenses appear here.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Chamber expenses')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Category')}</TableHead>
                  <TableHead>{t('Note')}</TableHead>
                  <TableHead className="text-end">{t('Amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(e.spentOn)}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.note ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-end">
                      {formatPkr(e.amount)}
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
