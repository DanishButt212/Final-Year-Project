import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Gavel } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { judgeOrdersApi } from '@/lib/phase5-api';
import { isoToDdMmYyyy, schedulingApi, todayIso, weekdayName } from '@/lib/scheduling-api';
import { HearingStatusBadge } from '@/pages/scheduling/UserSchedulePages';
import { JoinRoomButton, VirtualBadge } from '@/pages/virtual/JoinRoomButton';
import { OrderOutcomeBadge } from './JudgeOrdersPage';

/** Judge dashboard: today's hearings before this judge, in time order, with the video room link when virtual. */
export function TodayHearingsPanel() {
  const today = todayIso();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['hearings', 'judge', 'today', today],
    queryFn: () => schedulingApi.judgeHearings({ from: today, to: today }),
    refetchInterval: 60_000,
  });
  const rows = data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's cause list</CardTitle>
        <p className="text-sm text-text-muted">
          {weekdayName(today)} {isoToDdMmYyyy(today)}
        </p>
      </CardHeader>
      {isError && (
        <div className="px-5 pb-5">
          <Alert variant="error">{parseApiError(error).message}</Alert>
        </div>
      )}
      {isPending ? (
        <div className="px-5 pb-5">
          <Skeleton className="h-24" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No cases listed today"
          description="Cases fixed before you for today will appear here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p>
                  <span className="font-mono text-sm">
                    {h.startTime}
                    {h.endTime && `–${h.endTime}`}
                  </span>{' '}
                  <Link to={`/judge/cases/${h.caseId}`} className="case-number text-sm font-medium">
                    {h.ucn}
                  </Link>
                </p>
                <p className="font-semibold">{h.title}</p>
                <p className="text-sm text-text-muted">{h.courtroom?.name ?? '—'}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="flex flex-wrap gap-1">
                  <HearingStatusBadge status={h.status} />
                  {h.isVirtual && <VirtualBadge />}
                </span>
                {h.isVirtual && h.status === 'SCHEDULED' && <JoinRoomButton hearingId={h.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-3">
        <Link to="/judge/schedule" className="text-sm font-semibold">
          My full schedule
        </Link>
      </div>
    </Card>
  );
}

/** Judge dashboard: the five most recent orders and decisions. */
export function RecentOrdersPanel() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['judge', 'orders', { page: 1, search: '', outcome: '', recent: true }],
    queryFn: () => judgeOrdersApi.list({ page: 1, limit: 5 }),
  });
  const rows = data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent orders</CardTitle>
        <p className="text-sm text-text-muted">The last orders and decisions you recorded.</p>
      </CardHeader>
      {isError && (
        <div className="px-5 pb-5">
          <Alert variant="error">{parseApiError(error).message}</Alert>
        </div>
      )}
      {isPending ? (
        <div className="px-5 pb-5">
          <Skeleton className="h-24" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No orders recorded"
          description="Orders and judgments you record will be shown here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link to={`/judge/cases/${o.caseId}`} className="case-number text-sm font-medium">
                  {o.ucn}
                </Link>
                <p className="font-semibold">{o.title}</p>
                <p className="text-sm text-text-muted">Recorded {formatDateTime(o.recordedAt)}</p>
              </div>
              <OrderOutcomeBadge outcome={o.outcome} />
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-3">
        <Button asChild variant="secondary" size="sm">
          <Link to="/judge/orders">All orders</Link>
        </Button>
      </div>
    </Card>
  );
}
