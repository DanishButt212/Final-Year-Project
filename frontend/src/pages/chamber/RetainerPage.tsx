import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, PiggyBank, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
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
import { parseApiError } from '@/lib/api';
import { chamberApi, type RetainerRow } from '@/lib/chamber-api';
import { formatDate, formatPkr } from '@/lib/format';
import { RetainerBadge } from './shared';
import { balanceText } from './helpers';
import { useTranslation } from 'react-i18next';

function DepositDialog({ row, onClose }: { row: RetainerRow; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deposit = useMutation({
    mutationFn: () =>
      chamberApi.deposit(row.clientId, {
        amount: Number(amount),
        reference: reference.trim() || undefined,
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
      onClose();
    },
    onError: (e) => setError(parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!amount || !(n >= 1)) return setError(t('Enter a deposit of at least PKR 1.'));
            setError(null);
            deposit.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('Record retainer deposit')}</DialogTitle>
            <DialogDescription>
              {t('{{name}} ({{clientCode}}). Current balance {{balanceText}}.', {
                name: row.name,
                clientCode: row.clientCode,
                balanceText: balanceText(row.balance),
              })}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label={t('Amount (PKR)')} required>
              {(p) => (
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Field label={t('Reference (optional)')} hint={t('Cheque number or bank transfer ID')}>
              {(p) => (
                <Input
                  maxLength={100}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  {...p}
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={deposit.isPending}>
              <PiggyBank aria-hidden="true" /> {t('Record deposit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Retainer Accounts & Trust Ledgers Summary" */
export default function RetainerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [depositFor, setDepositFor] = useState<RetainerRow | null>(null);
  const [alertFor, setAlertFor] = useState<RetainerRow | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'retainer'],
    queryFn: chamberApi.retainerSummary,
  });

  const alert = useMutation({
    mutationFn: (id: string) => chamberApi.alert(id),
    onSuccess: async (res) => {
      toast.success(res.message);
      setAlertFor(null);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) => {
      setAlertFor(null);
      toast.error(parseApiError(e).message);
    },
  });

  return (
    <>
      <PageHeader
        title={t('Retainer Accounts & Trust Ledgers Summary')}
        description={
          data
            ? t('Balances are derived from the transactions. A client is flagged below {{pkr}}.', {
                pkr: formatPkr(data.thresholdPkr),
              })
            : undefined
        }
        crumbs={[{ label: t('Dashboard'), to: '/lawyer' }, { label: t('Retainer Accounts') }]}
        actions={
          <Button asChild variant="secondary">
            <Link to="/lawyer/chamber/settings">{t('Change threshold')}</Link>
          </Button>
        }
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title={t('No retainer accounts')}
            description={t('Register a client first, then record deposits here.')}
            action={
              <Button asChild>
                <Link to="/lawyer/chamber/clients/new">{t('Register client')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        data && (
          <Table aria-label={t('Retainer accounts')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Client')}</TableHead>
                <TableHead className="text-end">{t('Total upfront deposits')}</TableHead>
                <TableHead className="text-end">{t('Deducted billable costs')}</TableHead>
                <TableHead className="text-end">{t('Net remaining balance')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => (
                <TableRow key={r.clientId}>
                  <TableCell>
                    <Link to={`/lawyer/chamber/clients/${r.clientId}`} className="font-medium">
                      {r.name}
                    </Link>{' '}
                    <span className="case-number text-text-muted">{r.clientCode}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end">
                    {formatPkr(r.totalDeposits)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end">
                    {formatPkr(r.totalDeductions)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end font-semibold">
                    {balanceText(r.balance)}
                  </TableCell>
                  <TableCell>
                    <RetainerBadge status={r.status} />
                    {r.lastAlertAt && (
                      <p className="mt-1 text-xs text-text-muted">
                        {t('Alerted {{date}}', { date: formatDate(r.lastAlertAt) })}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setDepositFor(r)}>
                        <PiggyBank aria-hidden="true" /> {t('Deposit')}
                      </Button>
                      {r.status !== 'OK' && (
                        <Button size="sm" onClick={() => setAlertFor(r)}>
                          <BellRing aria-hidden="true" />{' '}
                          {t('Issue Low Balance Alert Notification')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">{t('All clients')}</TableCell>
                <TableCell className="whitespace-nowrap text-end font-bold">
                  {formatPkr(data.totals.deposits)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-end font-bold">
                  {formatPkr(data.totals.deductions)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-end font-bold">
                  {balanceText(data.totals.balance)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )
      )}

      {depositFor && <DepositDialog row={depositFor} onClose={() => setDepositFor(null)} />}
      {alertFor && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAlertFor(null)}
          title={t('Issue low balance alert?')}
          description={t(
            'A simulated SMS is sent to {{name}} about the balance of {{balanceText}}.',
            { name: alertFor.name, balanceText: balanceText(alertFor.balance) },
          )}
          confirmLabel={t('Issue alert')}
          loading={alert.isPending}
          onConfirm={() => alert.mutate(alertFor.clientId)}
        />
      )}
    </>
  );
}
