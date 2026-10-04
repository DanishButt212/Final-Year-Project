import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { caseTypeLabel } from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { feesApi } from '@/lib/phase4-api';
import { ChallanStatusBadge, LedgerTable } from '@/pages/cases/FeesPanel';
import { NotFoundPage } from '@/pages/ErrorPages';

/** Print profile of a challan. The browser print dialog hides the header and sidebar (no-print). */
export default function ChallanPrintPage() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['fees', 'challan', caseId],
    queryFn: () => feesApi.getChallan(caseId as string),
    enabled: Boolean(caseId && user),
    retry: false,
  });
  if (!user) return null;
  const portal = PORTALS[user.role];

  if (isPending) return <Skeleton className="h-96" />;
  if (isError) {
    return parseApiError(error).statusCode === 404 ? (
      <NotFoundPage />
    ) : (
      <Alert variant="error">{parseApiError(error).message}</Alert>
    );
  }
  if (!data) {
    return <Alert variant="info">No challan has been generated for this case yet.</Alert>;
  }

  return (
    <>
      <PageHeader
        title="Print Challan"
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'My Case Portfolio', to: portalPath(portal, 'cases') },
          { label: data.ucn, to: portalPath(portal, `cases/${data.caseId}`) },
          { label: 'Challan' },
        ]}
        actions={
          <>
            <Button onClick={() => window.print()}>
              <Printer aria-hidden="true" /> Print
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                feesApi.downloadChallan(data).catch((e) => toast.error(parseApiError(e).message))
              }
            >
              <Download aria-hidden="true" /> PDF
            </Button>
          </>
        }
      />
      <article className="max-w-3xl rounded-lg border border-border bg-surface p-6 print:border-0 print:p-0">
        <header className="mb-6 border-b-2 border-primary pb-3">
          <p className="font-heading text-xl font-bold text-primary">DigitalAdaalat</p>
          <h2 className="text-lg font-bold">Court Fee Challan</h2>
        </header>
        <dl className="mb-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-text-muted">Challan number</dt>
            <dd className="case-number font-semibold">{data.challanNo}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Status</dt>
            <dd>
              <ChallanStatusBadge challan={data} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Case number</dt>
            <dd className="case-number font-semibold">{data.ucn}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Case type</dt>
            <dd className="font-semibold">{caseTypeLabel(data.caseType)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm text-text-muted">Case title</dt>
            <dd className="font-semibold">{data.title}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Issued on</dt>
            <dd className="font-semibold">{formatDate(data.issuedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Due date</dt>
            <dd className="font-semibold">{formatDate(data.dueDate)}</dd>
          </div>
        </dl>
        <LedgerTable challan={data} />
        <p className="mt-6 text-sm text-text-muted">
          This is a computer generated challan. Pay it online through the DigitalAdaalat portal.
        </p>
      </article>
    </>
  );
}
