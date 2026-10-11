import { Term } from '@/components/glossary/Term';
import { QueryError } from '@/components/ui/query-error';
import { CopyButton } from '@/components/ui/copy-button';
import { PreviewButton } from '@/components/viewer/PreviewButton';
import { translateText } from '@/lib/server-messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CreditCard, Download, FileText, Printer, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
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
import { formatDate, formatPkr } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { feesApi, type Challan } from '@/lib/phase4-api';
import { cn } from '@/lib/utils';
import { Trans, useTranslation } from 'react-i18next';

const challanKey = (caseId: string) => ['fees', 'challan', caseId];

export function ChallanStatusBadge({ challan }: { challan: Pick<Challan, 'status' | 'overdue'> }) {
  const { t } = useTranslation();
  if (challan.status === 'PAID') return <Badge variant="decided">{t('Paid')}</Badge>;
  return <Badge variant={challan.overdue ? 'overdue' : 'pending'}>{t('Unpaid')}</Badge>;
}

export function LedgerTable({ challan }: { challan: Challan }) {
  const { t } = useTranslation();
  return (
    <Table aria-label={t('Cost ledger')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Item')}</TableHead>
          <TableHead className="text-end">{t('Amount (PKR)')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {challan.ledger.map((line) => (
          <TableRow key={line.code} className={cn(line.code === 'TOTAL' && 'font-bold')}>
            <TableCell>{translateText(line.label)}</TableCell>
            <TableCell className="whitespace-nowrap text-end">{formatPkr(line.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** UC-4.1: "Fees & Payment" tab of the case detail page. */
export default function FeesPanel({ caseId, claim }: { caseId: string; claim?: string | null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const {
    data: challan,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: challanKey(caseId),
    queryFn: () => feesApi.getChallan(caseId),
    enabled: Boolean(user),
  });

  const calculate = useMutation({
    mutationFn: () => feesApi.calculate(caseId),
    onSuccess: async (res) => {
      queryClient.setQueryData(challanKey(caseId), res.challan);
      setMessage(res.message);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['cases', 'summary'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (!user) return null;
  const portal = PORTALS[user.role];

  async function pdf() {
    if (!challan) return;
    setDownloading(true);
    try {
      await feesApi.downloadChallan(challan);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      {isError && <QueryError error={error} />}
      {message && <Alert variant="success">{message}</Alert>}

      {isPending ? (
        <Skeleton className="h-40" />
      ) : !challan ? (
        <Card>
          <EmptyState
            icon={Calculator}
            title={t('Court fee not calculated yet')}
            description={
              claim
                ? t('The fee is worked out from the case type and your claim value.')
                : t('The fee is worked out from the case type.')
            }
            action={
              <Button onClick={() => calculate.mutate()} loading={calculate.isPending}>
                <Calculator aria-hidden="true" /> {t('Calculate Costs and Fees')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                <Term id="challan">{t('Challan')}</Term>{' '}
                <span className="case-number">{challan.challanNo}</span>{' '}
                <CopyButton value={challan.challanNo} label={t('Copy challan number')} />
              </CardTitle>
              <p className="text-sm text-text-muted">
                {challan.overdue
                  ? t('Issued {{issued}} · Due {{due}} (overdue)', {
                      issued: formatDate(challan.issuedAt),
                      due: formatDate(challan.dueDate),
                    })
                  : t('Issued {{issued}} · Due {{due}}', {
                      issued: formatDate(challan.issuedAt),
                      due: formatDate(challan.dueDate),
                    })}
              </p>
            </div>
            <ChallanStatusBadge challan={challan} />
          </CardHeader>
          <CardContent className="space-y-5">
            <LedgerTable challan={challan} />
            <div className="flex flex-wrap gap-3">
              {challan.status === 'UNPAID' && (
                <>
                  <Button onClick={() => navigate(portalPath(portal, `pay/${challan.id}`))}>
                    <CreditCard aria-hidden="true" /> {t('Pay Fee Online')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => calculate.mutate()}
                    loading={calculate.isPending}
                  >
                    <Calculator aria-hidden="true" /> {t('Recalculate')}
                  </Button>
                </>
              )}
              <Button variant="secondary" asChild>
                <Link to={portalPath(portal, `cases/${caseId}/challan`)}>
                  <Printer aria-hidden="true" /> {t('Print Challan')}
                </Link>
              </Button>
              <PreviewButton
                label={t('Preview challan')}
                size="default"
                file={{
                  path: `/challans/${challan.id}/pdf`,
                  name: `${challan.challanNo}.pdf`,
                  kind: 'pdf',
                }}
              />
              <Button variant="secondary" onClick={pdf} loading={downloading}>
                <Download aria-hidden="true" /> {t('Download Challan PDF')}
              </Button>
              {challan.status === 'PAID' && challan.payment?.receiptNo && (
                <PreviewButton
                  label={t('Preview receipt')}
                  size="default"
                  file={{
                    path: `/payments/${challan.payment.id}/receipt`,
                    name: `${challan.payment.receiptNo}.pdf`,
                    kind: 'pdf',
                  }}
                />
              )}
              {challan.status === 'PAID' && challan.payment?.receiptNo && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    feesApi
                      .downloadReceipt(challan.payment!.id, challan.payment!.receiptNo!)
                      .catch((e) => toast.error(parseApiError(e).message))
                  }
                >
                  <Receipt aria-hidden="true" /> {t('Download Receipt Proof')}
                </Button>
              )}
            </div>
            {challan.status === 'PAID' && (
              <Alert variant="success" title={t('Fee paid')}>
                <Trans
                  i18nKey="Receipt {{receiptNo}}. See all payments under <link>Payments & Receipts</link>."
                  defaults="Receipt {{receiptNo}}. See all payments under <link>Payments & Receipts</link>."
                  values={{ receiptNo: challan.payment?.receiptNo ?? '' }}
                  components={{
                    link: <Link to={portalPath(portal, 'payments')} className="font-semibold" />,
                  }}
                />
              </Alert>
            )}
            {challan.status === 'UNPAID' && (
              <p className="flex items-center gap-1.5 text-sm text-text-muted">
                <FileText className="size-4" aria-hidden="true" />{' '}
                {t('A case enters the allocation queue once its fee is paid.')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
