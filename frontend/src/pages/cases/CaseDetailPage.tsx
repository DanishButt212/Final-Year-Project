import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseApiError } from '@/lib/api';
import { casesApi, type CaseDetail } from '@/lib/cases-api';
import { caseTypeLabel, CLOSED_STATUSES, judgeBench } from '@/lib/case-status';
import { formatDate, formatDateTime, formatPkr } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { NotFoundPage } from '@/pages/ErrorPages';
import FeesPanel from './FeesPanel';
import VaultPanel from './VaultPanel';

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

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const [search] = useSearchParams();
  const requested = search.get('tab');
  const initialTab = ['fees', 'documents', 'lifecycle'].includes(requested ?? '')
    ? (requested as string)
    : 'overview';
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

      <Tabs defaultValue={initialTab}>
        <TabsList aria-label="Case sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fees">Fees & Payment</TabsTrigger>
          <TabsTrigger value="documents">Evidence Vault</TabsTrigger>
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
                {data.claimAmountPkr && (
                  <Detail label="Claim value">{formatPkr(data.claimAmountPkr)}</Detail>
                )}
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

        <TabsContent value="fees">
          <FeesPanel caseId={data.id} claim={data.claimAmountPkr} />
        </TabsContent>

        <TabsContent value="documents">
          <VaultPanel
            caseId={data.id}
            canAttachPleadings={!CLOSED_STATUSES.includes(data.status)}
          />
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
