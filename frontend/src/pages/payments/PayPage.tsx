import { QueryError } from '@/components/ui/query-error';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Download, ShieldAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { SuccessPanel } from '@/components/feedback/SuccessPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { PreviewButton } from '@/components/viewer/PreviewButton';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatPkr } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { feesApi } from '@/lib/phase4-api';
import { NotFoundPage } from '@/pages/ErrorPages';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

// eslint-disable-next-line react-refresh/only-export-components -- message constant, translated where shown
export const REJECTED_MESSAGE = msg('Payment Unsuccessful: Gateway rejected request details.');

const TEST_CARDS = [
  ['4242 4242 4242 4242', msg('Approved')],
  ['5555 5555 5555 4444', msg('Approved')],
  ['4000 0000 0000 0002', msg('Declined: insufficient funds')],
  [msg('Any other number'), msg('Declined')],
];

const formatCard = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/** UC-4.2: the simulated "Demo Payment Gateway". Card data is read from the form on submit and cleared at once. */
export default function PayPage() {
  const { t } = useTranslation();
  const { challanId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState<{ receiptNo: string; paymentId: string; amount: string } | null>(
    null,
  );

  // Opens (or reuses) a pending payment. Refetching after a failure opens a fresh one.
  const session = useQuery({
    queryKey: ['payments', 'checkout', challanId],
    queryFn: () => feesApi.checkout(challanId as string),
    enabled: Boolean(challanId && user),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const pay = useMutation({
    mutationFn: feesApi.authorize,
    onSuccess: async (res) => {
      setFailure(null);
      setDone({ receiptNo: res.receiptNo, paymentId: res.paymentId, amount: res.amount });
      toast.success(t('Payment successful.'));
      await queryClient.invalidateQueries();
    },
    onError: (e) => {
      const body = parseApiError(e);
      setFailure(body.statusCode === 402 ? REJECTED_MESSAGE : body.message);
    },
  });

  if (!user) return null;
  const portal = PORTALS[user.role];

  if (session.isError && parseApiError(session.error).statusCode === 404) return <NotFoundPage />;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pay.isPending || !session.data) return;
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const cardholderName = String(data.get('cardholderName') ?? '').trim();
    const cardNumber = String(data.get('cardNumber') ?? '');
    const expiry = String(data.get('expiry') ?? '');
    const cvv = String(data.get('cvv') ?? '');
    if (!cardholderName || !cardNumber || !expiry || !cvv) {
      setFieldError(t('Please complete all card fields.'));
      return;
    }
    setFieldError(null);
    setFailure(null);
    // The card data lives only in this call. The form is wiped immediately.
    pay.mutate({ paymentId: session.data.paymentId, cardholderName, cardNumber, expiry, cvv });
    form.reset();
  }

  async function retry() {
    setFailure(null);
    pay.reset();
    await session.refetch();
  }

  return (
    <>
      <PageHeader
        title={t('Demo Payment Gateway')}
        description={t('Pay your court fee. This is a simulated gateway for demonstration.')}
        crumbs={[
          { label: t('Dashboard'), to: portalPath(portal, '') },
          { label: t('Payments & Receipts'), to: portalPath(portal, 'payments') },
          { label: t('Pay fee') },
        ]}
      />

      <div className="max-w-2xl space-y-6">
        <div
          role="note"
          className="flex gap-3 rounded-md border-2 border-accent bg-accent-soft p-4 text-text"
        >
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-bold">{t('Simulated gateway. Do not enter real card details.')}</p>
            <p className="text-sm">
              {t(
                'No real payment is made and nothing you type here is stored. Use one of these test cards (any name, a future expiry such as 12/30, any 3 digit code):',
              )}
            </p>
            <ul className="text-sm">
              {TEST_CARDS.map(([n, r]) => (
                <li key={n}>
                  <span className="font-mono">{n}</span> · {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {done ? (
          <SuccessPanel
            className="max-w-none"
            title={t('Payment successful')}
            description={t('{{pkr}} received.', { pkr: formatPkr(done.amount) })}
            reference={{
              label: t('Receipt number'),
              value: done.receiptNo,
              copyLabel: t('Copy receipt number'),
            }}
            actions={
              <>
                <PreviewButton
                  size="default"
                  variant="secondary"
                  label={t('Preview receipt')}
                  file={{
                    path: `/payments/${done.paymentId}/receipt`,
                    name: `${done.receiptNo}.pdf`,
                    kind: 'pdf',
                  }}
                />
                <Button
                  onClick={() =>
                    feesApi
                      .downloadReceipt(done.paymentId, done.receiptNo)
                      .catch((e) => toast.error(parseApiError(e).message))
                  }
                >
                  <Download aria-hidden="true" /> {t('Download receipt')}
                </Button>
                <Button variant="secondary" asChild>
                  <Link to={portalPath(portal, 'payments')}>{t('Payments & Receipts')}</Link>
                </Button>
              </>
            }
          />
        ) : session.isPending ? (
          <Skeleton className="h-72" />
        ) : session.isError ? (
          <QueryError error={session.error} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-5 text-primary" aria-hidden="true" /> {t('Checkout')}
              </CardTitle>
              <p className="text-sm text-text-muted">
                {t('Challan')} <span className="case-number">{session.data.challanNo}</span> ·{' '}
                <strong>{formatPkr(session.data.amount)}</strong>
              </p>
            </CardHeader>
            <CardContent>
              {failure ? (
                <div className="space-y-4">
                  <Alert variant="error">{failure}</Alert>
                  <Button onClick={retry} loading={session.isFetching}>
                    {t('Try again')}
                  </Button>
                </div>
              ) : (
                <form
                  ref={formRef}
                  onSubmit={submit}
                  autoComplete="off"
                  noValidate
                  className="space-y-4"
                >
                  {fieldError && <Alert variant="error">{fieldError}</Alert>}
                  <Field label={t('Cardholder name')} required>
                    {(p) => (
                      <Input name="cardholderName" autoComplete="off" maxLength={80} {...p} />
                    )}
                  </Field>
                  <Field label={t('Card number')} required>
                    {(p) => (
                      <Input
                        name="cardNumber"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="4242 4242 4242 4242"
                        maxLength={23}
                        onInput={(e) => {
                          e.currentTarget.value = formatCard(e.currentTarget.value);
                        }}
                        {...p}
                      />
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t('Expiry (MM/YY)')} required>
                      {(p) => (
                        <Input
                          name="expiry"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="12/30"
                          maxLength={5}
                          onInput={(e) => {
                            e.currentTarget.value = formatExpiry(e.currentTarget.value);
                          }}
                          {...p}
                        />
                      )}
                    </Field>
                    <Field label="CVV" required>
                      {(p) => (
                        <Input
                          name="cvv"
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={4}
                          onInput={(e) => {
                            e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '');
                          }}
                          {...p}
                        />
                      )}
                    </Field>
                  </div>
                  <Button type="submit" size="lg" loading={pay.isPending} disabled={pay.isPending}>
                    {t('Pay {{pkr}}', { pkr: formatPkr(session.data.amount) })}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
