import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
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

const PAGE_SIZE = 10;

/** UC-4.3: transaction log with "Download Receipt Proof". */
export default function PaymentsPage() {
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
        title="Payments & Receipts"
        description="Your court fee transactions. Download a receipt as proof of payment."
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'Payments & Receipts' },
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
        Show failed attempts
      </label>
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title="No payments yet"
            description="Pay a court fee from the Fees & Payment tab of a case and it will appear here."
            action={
              <Button variant="secondary" asChild>
                <Link to={portalPath(portal, 'cases')}>Open my cases</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Transaction log">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Challan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
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
                    <TableCell className="case-number whitespace-nowrap">{p.challanNo}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatPkr(p.amount)}
                    </TableCell>
                    <TableCell>
                      {p.status === 'SUCCESS' ? (
                        <Badge variant="decided">Paid</Badge>
                      ) : (
                        <Badge variant="rejected">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.status === 'SUCCESS' && p.receiptNo ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            feesApi
                              .downloadReceipt(p.id, p.receiptNo!)
                              .catch((e) => toast.error(parseApiError(e).message))
                          }
                          aria-label={`Download Receipt Proof ${p.receiptNo}`}
                        >
                          <Download aria-hidden="true" /> Download Receipt Proof
                        </Button>
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
