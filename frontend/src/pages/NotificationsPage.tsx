import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { NOTIFICATIONS_KEY } from '@/components/layout/NotificationBell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { notificationsApi } from '@/lib/admin-api';
import { formatDateTime } from '@/lib/format';
import { roleHome } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

/** Full list of the signed-in user's in-app notifications. */
export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'page', page],
    queryFn: () => notificationsApi.list({ page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });
  const markAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh });

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your cases and account."
        crumbs={[{ label: 'Dashboard', to: roleHome(user.role) }, { label: 'Notifications' }]}
        actions={
          <Button
            variant="secondary"
            onClick={() => markAll.mutate()}
            disabled={!data || data.unreadCount === 0}
            loading={markAll.isPending}
          >
            <CheckCheck aria-hidden="true" /> Mark all as read
          </Button>
        }
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <div role="status" aria-label="Loading notifications" className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="When something happens in your cases, it will show here."
          />
        </Card>
      ) : (
        data && (
          <>
            <Card>
              <ul className="divide-y divide-border">
                {data.data.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'flex flex-wrap items-start justify-between gap-3 px-5 py-4',
                      !n.readAt && 'bg-row-alt',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {!n.readAt && (
                          <span
                            className="mr-2 inline-block size-2 rounded-full bg-primary align-middle"
                            aria-label="Unread"
                          />
                        )}
                        {n.title}
                      </p>
                      <p className="break-words text-text-muted">{n.body}</p>
                      <p className="mt-1 text-sm text-text-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.readAt && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markRead.mutate(n.id)}
                        aria-label={`Mark "${n.title}" as read`}
                      >
                        Mark as read
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
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
