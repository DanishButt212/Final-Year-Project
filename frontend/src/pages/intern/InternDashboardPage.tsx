import { QueryError } from '@/components/ui/query-error';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, MapPin, NotebookPen, Hourglass } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { internApi } from '@/lib/chamber-api';
import { formatDate } from '@/lib/format';
import { LogStatusBadge } from '@/pages/chamber/InternsPages';
import { StatCard } from '@/pages/chamber/shared';
import { useTranslation } from 'react-i18next';

/** Intern dashboard: attendance days, entries, pending reviews and the latest review results. */
export default function InternDashboardPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['intern', 'summary'],
    queryFn: internApi.summary,
    retry: false,
  });
  return (
    <>
      <PageHeader
        title={t('Dashboard')}
        description={
          data?.chamberName
            ? t('Your internship at {{chamberName}}.', { chamberName: data.chamberName })
            : t('Your diary, attendance and progress.')
        }
        actions={
          <Button asChild>
            <Link to="/intern/attendance">
              <MapPin aria-hidden="true" /> {t('Attendance')}
            </Link>
          </Button>
        }
      />
      {isError && <QueryError error={error} />}
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('Days attended this month')}
                value={data.daysThisMonth}
                icon={CalendarCheck}
                hint={data.checkedInToday ? t('Checked in today') : t('Not checked in today')}
              />
              <StatCard label={t('Research logs')} value={data.entries} icon={NotebookPen} />
              <StatCard label={t('Awaiting review')} value={data.pendingReviews} icon={Hourglass} />
              <StatCard label={t('Approved logs')} value={data.approved} icon={NotebookPen} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('Recent reviews')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentReviews.length === 0 ? (
                  <p className="text-text-muted">
                    {t('Your supervisor has not reviewed any log yet.')}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.recentReviews.map((l) => (
                      <li key={l.id} className="space-y-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="case-number font-medium">{l.ucn ?? t('No case')}</span>{' '}
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
                  <Link to="/intern/research-logs">{t('Open research logs')}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )
      )}
    </>
  );
}
