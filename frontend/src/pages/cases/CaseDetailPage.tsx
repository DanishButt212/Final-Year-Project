import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Lock, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PdfDropZone } from '@/components/ui/pdf-drop-zone';
import { ProgressBar } from '@/components/ui/progress';
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
import { casesApi, type CaseDetail, type CaseDocument } from '@/lib/cases-api';
import { caseTypeLabel, CLOSED_STATUSES, judgeBench } from '@/lib/case-status';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { NotFoundPage } from '@/pages/ErrorPages';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function PartyList({ title, parties }: { title: string; parties: CaseDetail['parties'] }) {
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

function DocumentsTab({ detail }: { detail: CaseDetail }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const closed = CLOSED_STATUSES.includes(detail.status);

  const upload = useMutation({
    mutationFn: () => casesApi.addDocuments(detail.id, files, setProgress),
    onSuccess: async (res) => {
      setSuccess(res.message);
      toast.success(res.message);
      setFiles([]);
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (e) => {
      setProgress(null);
      setError(parseApiError(e).message);
    },
  });

  async function download(doc: CaseDocument) {
    setDownloading(doc.id);
    try {
      await casesApi.download(detail.id, doc);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attached documents</CardTitle>
          <p className="flex items-center gap-1.5 text-sm text-text-muted">
            <Lock className="size-4" aria-hidden="true" /> Documents are locked to this case number
            and cannot be changed or deleted.
          </p>
        </CardHeader>
        {detail.documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents attached yet"
            description="Upload petitions, statements or affidavits as PDF below."
          />
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
                {detail.documents.map((d) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Attach more documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {closed ? (
            <Alert variant="info">Documents cannot be attached to a closed case.</Alert>
          ) : (
            <>
              {success && <Alert variant="success">{success}</Alert>}
              {error && <Alert variant="error">{error}</Alert>}
              <PdfDropZone
                files={files}
                onFilesChange={(next) => {
                  setSuccess(null);
                  setError(null);
                  setFiles(next);
                }}
                disabled={upload.isPending}
              />
              {progress !== null && <ProgressBar value={progress} label="Uploading documents" />}
              <Button
                disabled={files.length === 0 || upload.isPending}
                loading={upload.isPending}
                onClick={() => {
                  setSuccess(null);
                  setError(null);
                  upload.mutate();
                }}
              >
                <Paperclip aria-hidden="true" /> Attach{' '}
                {files.length > 1 ? `${files.length} documents` : 'document'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const { data, isPending, error } = useQuery({
    queryKey: ['cases', 'detail', caseId],
    queryFn: () => casesApi.get(caseId as string),
    enabled: Boolean(caseId && user),
    retry: false,
  });

  if (!user) return null;
  const portal = PORTALS[user.role];

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

  return (
    <>
      <PageHeader
        title={data.title}
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'My Case Portfolio', to: portalPath(portal, 'cases') },
          { label: data.ucn },
        ]}
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-3">
        <span
          className="case-number rounded-md border border-primary bg-primary-soft px-3 py-1 text-lg font-medium text-primary"
          data-testid="case-ucn"
        >
          {data.ucn}
        </span>
        <StatusBadge status={data.status} />
        <span className="text-text-muted">{caseTypeLabel(data.caseType)}</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList aria-label="Case sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents ({data.documents.length})</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Case information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Case number">
                  <span className="case-number">{data.ucn}</span>
                </Detail>
                <Detail label="Case type">{caseTypeLabel(data.caseType)}</Detail>
                <Detail label="Filing date">{formatDate(data.filingDate)}</Detail>
                <Detail label="Filed by">{data.filedBy}</Detail>
                <Detail label="Court">
                  {data.court ? `${data.court.name}, ${data.court.city}` : 'Not yet assigned'}
                </Detail>
                <Detail label="Next hearing">
                  {data.nextHearing
                    ? `${formatDate(data.nextHearing.date)} at ${data.nextHearing.startTime ?? ''}, ${data.nextHearing.courtroom ?? ''}`
                    : 'No hearing scheduled yet'}
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
          <div className="grid gap-6 md:grid-cols-2">
            <PartyList title="Petitioners" parties={petitioners} />
            <PartyList title="Opposing parties" parties={others} />
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab detail={data} />
        </TabsContent>

        <TabsContent value="lifecycle">
          <Card>
            <CardHeader>
              <CardTitle>Case lifecycle</CardTitle>
            </CardHeader>
            <CardContent>
              {data.events.length === 0 ? (
                <p className="text-text-muted">No events recorded yet.</p>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
