import { useQuery } from '@tanstack/react-query';
import { Briefcase, FilePlus2, Hourglass, Scale } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { parseApiError } from '@/lib/api';
import { casesApi } from '@/lib/cases-api';
import { caseTypeLabel, judgeBench } from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { MESSAGES } from '@/lib/schemas';

function Stat({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-3xl font-bold leading-none" data-testid={`stat-${label}`}>
            {value}
          </p>
          <p className="mt-1 text-sm text-text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard block for litigants and lawyers: case totals and the five most recent cases (real API data). */
export default function CaseOverview() {
  const { user } = useAuth();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['cases', 'summary'],
    queryFn: casesApi.summary,
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];
  const base = portalPath(portal, 'cases');

  return (
    <section aria-label="Case overview" className="mb-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Your cases</h2>
        <Button asChild size="lg">
          <Link to={portalPath(portal, 'new-case')}>
            <FilePlus2 aria-hidden="true" /> New Case Submission
          </Link>
        </Button>
      </div>

      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}

      {isPending ? (
        <div role="status" aria-label="Loading cases" className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat icon={Scale} label="Total cases" value={data.total} />
              <Stat icon={Hourglass} label="Pending assignment" value={data.pendingAssignment} />
            </div>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent cases</CardTitle>
                {data.recent.length > 0 && (
                  <Link to={base} className="text-sm font-semibold">
                    View all
                  </Link>
                )}
              </CardHeader>
              {data.recent.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title={MESSAGES.emptyPortfolio}
                  description="Submit your first case to see it here."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link to={portalPath(portal, 'new-case')}>New Case Submission</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recent.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`${base}/${c.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-text no-underline hover:bg-primary-soft"
                      >
                        <span className="min-w-0">
                          <span className="case-number block text-sm font-medium text-primary">
                            {c.ucn}
                          </span>
                          <span className="block break-words font-semibold">{c.title}</span>
                          <span className="block text-sm text-text-muted">
                            {caseTypeLabel(c.caseType)} · {judgeBench(c)} · Filed{' '}
                            {formatDate(c.filingDate)}
                          </span>
                        </span>
                        <StatusBadge status={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )
      )}
    </section>
  );
}
