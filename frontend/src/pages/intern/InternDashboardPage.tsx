import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, MapPin, NotebookPen, Hourglass } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { internApi } from '@/lib/chamber-api';
import { formatDate } from '@/lib/format';
import { LogStatusBadge } from '@/pages/chamber/InternsPages';
import { StatCard } from '@/pages/chamber/shared';

/** Intern dashboard: attendance days, entries, pending reviews and the latest review results. */
export default function InternDashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['intern', 'summary'],
    queryFn: internApi.summary,
    retry: false,
  });
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          data?.chamberName
            ? `Your internship at ${data.chamberName}.`
            : 'Your diary, attendance and progress.'
        }
        actions={
          <Button asChild>
            <Link to="/intern/attendance">
              <MapPin aria-hidden="true" /> Attendance
            </Link>
          </Button>
        }
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Days attended this month"
                value={data.daysThisMonth}
                icon={CalendarCheck}
                hint={data.checkedInToday ? 'Checked in today' : 'Not checked in today'}
              />
              <StatCard label="Research logs" value={data.entries} icon={NotebookPen} />
              <StatCard label="Awaiting review" value={data.pendingReviews} icon={Hourglass} />
              <StatCard label="Approved logs" value={data.approved} icon={NotebookPen} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Recent reviews</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentReviews.length === 0 ? (
                  <p className="text-text-muted">Your supervisor has not reviewed any log yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.recentReviews.map((l) => (
                      <li key={l.id} className="space-y-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="case-number font-medium">{l.ucn ?? 'No case'}</span>{' '}
                            <span className="text-text-muted">{formatDate(l.reviewedAt)}</span>
                          </span>
                          <LogStatusBadge status={l.status} />
                        </div>
                        <p className="text-sm">{l.citation}</p>
                        {l.reviewComment && (
                          <p className="text-sm text-text-muted">{l.reviewComment}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="secondary" className="mt-4">
                  <Link to="/intern/research-logs">Open research logs</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )
      )}
    </>
  );
}
