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
import { balanceText, RetainerBadge } from './shared';

function DepositDialog({ row, onClose }: { row: RetainerRow; onClose: () => void }) {
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
            if (!amount || !(n >= 1)) return setError('Enter a deposit of at least PKR 1.');
            setError(null);
            deposit.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Record retainer deposit</DialogTitle>
            <DialogDescription>
              {row.name} ({row.clientCode}). Current balance {balanceText(row.balance)}.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label="Amount (PKR)" required>
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
            <Field label="Reference (optional)" hint="Cheque number or bank transfer ID">
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
              Cancel
            </Button>
            <Button type="submit" loading={deposit.isPending}>
              <PiggyBank aria-hidden="true" /> Record deposit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Retainer Accounts & Trust Ledgers Summary" */
export default function RetainerPage() {
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
        title="Retainer Accounts & Trust Ledgers Summary"
        description={
          data
            ? `Balances are derived from the transactions. A client is flagged below PKR ${Number(data.thresholdPkr).toLocaleString('en-PK')}.`
            : undefined
        }
        crumbs={[{ label: 'Dashboard', to: '/lawyer' }, { label: 'Retainer Accounts' }]}
        actions={
          <Button asChild variant="secondary">
            <Link to="/lawyer/chamber/settings">Change threshold</Link>
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
            title="No retainer accounts"
            description="Register a client first, then record deposits here."
            action={
              <Button asChild>
                <Link to="/lawyer/chamber/clients/new">Register client</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        data && (
          <Table aria-label="Retainer accounts">
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Total upfront deposits</TableHead>
                <TableHead className="text-right">Deducted billable costs</TableHead>
                <TableHead className="text-right">Net remaining balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
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
                  <TableCell className="whitespace-nowrap text-right">
                    {formatPkr(r.totalDeposits)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatPkr(r.totalDeductions)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">
                    {balanceText(r.balance)}
                  </TableCell>
                  <TableCell>
                    <RetainerBadge status={r.status} />
                    {r.lastAlertAt && (
                      <p className="mt-1 text-xs text-text-muted">
                        Alerted {formatDate(r.lastAlertAt)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setDepositFor(r)}>
                        <PiggyBank aria-hidden="true" /> Deposit
                      </Button>
                      {r.status !== 'OK' && (
                        <Button size="sm" onClick={() => setAlertFor(r)}>
                          <BellRing aria-hidden="true" /> Issue Low Balance Alert Notification
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">All clients</TableCell>
                <TableCell className="whitespace-nowrap text-right font-bold">
                  {formatPkr(data.totals.deposits)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-bold">
                  {formatPkr(data.totals.deductions)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-bold">
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
          title="Issue low balance alert?"
          description={`A simulated SMS is sent to ${alertFor.name} about the balance of ${balanceText(alertFor.balance)}.`}
          confirmLabel="Issue alert"
          loading={alert.isPending}
          onConfirm={() => alert.mutate(alertFor.clientId)}
        />
      )}
    </>
  );
}
