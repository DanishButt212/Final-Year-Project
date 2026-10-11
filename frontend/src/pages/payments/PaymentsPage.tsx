import { QueryError } from '@/components/ui/query-error';
import { CopyButton } from '@/components/ui/copy-button';
import { PreviewButton } from '@/components/viewer/PreviewButton';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
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
import { formatDate, formatPkr } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { feesApi } from '@/lib/phase4-api';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 10;

/** UC-4.3: transaction log with "Download Receipt Proof". */
export default function PaymentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [showFailed, setShowFailed] = useState(false);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['payments', 'mine', page, showFailed],
    queryFn: () => feesApi.myPayments({ page, limit: PAGE_SIZE, includeFailed: showFailed }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];

  return (
    <>
      <PageHeader
        title={t('Payments & Receipts')}
        description={t('Your court fee transactions. Download a receipt as proof of payment.')}
        crumbs={[
          { label: t('Dashboard'), to: portalPath(portal, '') },
          { label: t('Payments & Receipts') },
        ]}
      />
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={showFailed}
          onChange={(e) => {
            setShowFailed(e.target.checked);
            setPage(1);
          }}
        />
        {t('Show failed attempts')}
      </label>
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={t('No payments yet')}
            description={t(
              'Pay a court fee from the Fees & Payment tab of a case and it will appear here.',
            )}
            action={
              <Button variant="secondary" asChild>
                <Link to={portalPath(portal, 'cases')}>{t('Open my cases')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Transaction log')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Case')}</TableHead>
                  <TableHead>{t('Challan')}</TableHead>
                  <TableHead className="text-end">{t('Amount')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Receipt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
                    <TableCell>
                      <Link
                        to={portalPath(portal, `cases/${p.caseId}`)}
                        className="case-number font-medium"
                      >
                        {p.ucn}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="case-number">{p.challanNo}</span>{' '}
                      <CopyButton value={p.challanNo} label={t('Copy challan number')} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-end">
                      {formatPkr(p.amount)}
                    </TableCell>
                    <TableCell>
                      {p.status === 'SUCCESS' ? (
                        <Badge variant="decided">{t('Paid')}</Badge>
                      ) : (
                        <Badge variant="rejected">{t('Failed')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.status === 'SUCCESS' && p.receiptNo ? (
                        <div className="flex flex-wrap gap-2">
                          <PreviewButton
                            iconOnly
                            file={{
                              path: `/payments/${p.id}/receipt`,
                              name: `${p.receiptNo}.pdf`,
                              kind: 'pdf',
                            }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              feesApi
                                .downloadReceipt(p.id, p.receiptNo!)
                                .catch((e) => toast.error(parseApiError(e).message))
                            }
                            aria-label={t('Download Receipt Proof {{receiptNo}}', {
                              receiptNo: p.receiptNo,
                            })}
                          >
                            <Download aria-hidden="true" /> {t('Download Receipt Proof')}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
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
