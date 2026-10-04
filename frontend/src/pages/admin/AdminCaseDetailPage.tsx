import { useQuery } from '@tanstack/react-query';
import { Download, FileText, ScrollText, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import type { CaseDetail, CaseDocument } from '@/lib/cases-api';
import { caseTypeLabel, judgeBench } from '@/lib/case-status';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format';
import { NotFoundPage } from '@/pages/ErrorPages';
import { DecisionBlock } from '@/pages/cases/DecisionBlock';
import { AllocateDialog } from './AllocateDialog';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function Parties({ title, parties }: { title: string; parties: CaseDetail['parties'] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="space-y-2">
        {parties.map((p) => (
          <li key={p.id} className="rounded-md border border-border bg-surface p-3">
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-text-muted">
              {[p.cnic, p.phone, p.address].filter(Boolean).join(' · ') ||
                'No further details given'}
            </p>
            {p.hasCounsel && <p className="text-sm text-text-muted">Represented by counsel</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Admin view of one case: overview, parties, documents (download) and lifecycle, with allocation. */
export default function AdminCaseDetailPage() {
  const { caseId } = useParams();
  const [allocating, setAllocating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'cases', 'detail', caseId],
    queryFn: () => adminApi.caseDetail(caseId as string),
    enabled: Boolean(caseId),
    retry: false,
  });

  async function download(doc: CaseDocument) {
    setDownloading(doc.id);
    try {
      await adminApi.downloadDocument(caseId as string, doc);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setDownloading(null);
    }
  }

  if (isPending) {
    return (
      <div role="status" aria-label="Loading case" className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (error || !data) {
    return parseApiError(error).statusCode === 404 || !data ? (
      <NotFoundPage />
    ) : (
      <Alert variant="error">{parseApiError(error).message}</Alert>
    );
  }

  const petitioners = data.parties.filter((p) => p.role === 'PETITIONER' || p.role === 'APPELLANT');
  const others = data.parties.filter((p) => p.role !== 'PETITIONER' && p.role !== 'APPELLANT');
  const allocatable = data.status === 'PENDING_ASSIGNMENT' || data.status === 'ALLOCATED';

  return (
    <>
      <PageHeader
        title={data.title}
        crumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Case Registry & Allocation', to: '/admin/cases' },
          { label: data.ucn },
        ]}
        actions={
          <>
            {data.status !== 'PENDING_ASSIGNMENT' && data.status !== 'DRAFT' && (
              <Button variant="secondary" asChild>
                <Link to={`/admin/summons?issue=${data.id}`}>
                  <ScrollText aria-hidden="true" /> Issue summons
                </Link>
              </Button>
            )}
            {allocatable && (
              <Button onClick={() => setAllocating(true)}>
                <Shuffle aria-hidden="true" />{' '}
                {data.status === 'ALLOCATED' ? 'Re-allocate' : 'Allocate case'}
              </Button>
            )}
          </>
        }
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-3">
        <span className="case-number rounded-md border border-primary bg-primary-soft px-3 py-1 text-lg font-medium text-primary">
          {data.ucn}
        </span>
        <StatusBadge status={data.status} />
        <span className="text-text-muted">{caseTypeLabel(data.caseType)}</span>
      </div>

      <DecisionBlock decision={data.decision} />

      <Tabs defaultValue="overview">
        <TabsList aria-label="Case sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="documents">Documents ({data.documents.length})</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Case information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Case type">{caseTypeLabel(data.caseType)}</Detail>
                <Detail label="Filing date">{formatDate(data.filingDate)}</Detail>
                <Detail label="Filed by">{data.filedBy}</Detail>
                <Detail label="Allocated on">{formatDate(data.allocatedAt)}</Detail>
                <Detail label="Court">
                  {data.court ? `${data.court.name}, ${data.court.city}` : 'Not yet assigned'}
                </Detail>
                <Detail label="Judge bench">
                  {judgeBench({ judge: data.judge, courtroom: data.courtroom?.name ?? null })}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Relief sought">
                    <span className="whitespace-pre-wrap font-normal">{data.reliefSought}</span>
                  </Detail>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parties">
          <div className="grid gap-6 md:grid-cols-2">
            <Parties title="Petitioners" parties={petitioners} />
            <Parties title="Opposing parties" parties={others} />
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            {data.documents.length === 0 ? (
              <EmptyState icon={FileText} title="No documents attached" />
            ) : (
              <div className="p-5">
                <Table aria-label="Documents">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="min-w-48 font-medium">{d.name}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatFileSize(d.sizeBytes)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(d.uploadedAt)}
                          <span className="block text-sm text-text-muted">{d.uploadedBy}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={downloading === d.id}
                            onClick={() => download(d)}
                            aria-label={`Download ${d.name}`}
                          >
                            <Download aria-hidden="true" /> Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="lifecycle">
          <Card>
            <CardHeader>
              <CardTitle>Case lifecycle</CardTitle>
            </CardHeader>
            <CardContent>
              <ol
                className="relative space-y-6 border-l-2 border-border pl-6"
                aria-label="Lifecycle events"
              >
                {data.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[31px] top-1 size-3 rounded-full border-2 border-primary bg-surface"
                    />
                    <p className="font-semibold">{e.description}</p>
                    <p className="text-sm text-text-muted">
                      <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                      {e.actor && ` · ${e.actor}`}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {allocating && (
        <AllocateDialog
          open
          caseId={data.id}
          ucn={data.ucn}
          reallocate={data.status === 'ALLOCATED'}
          onOpenChange={(o) => !o && setAllocating(false)}
        />
      )}
    </>
  );
}
