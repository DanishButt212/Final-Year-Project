import { translateNotice } from '@/lib/server-messages';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { NOTIFICATIONS_KEY } from '@/lib/query-keys';
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
import { notificationLink } from '@/lib/scheduling-api';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { humanizeCodes } from '@/lib/labels';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 15;

/** Full list of the signed-in user's in-app notifications. */
export default function NotificationsPage() {
  const { t } = useTranslation();
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
        title={t('Notifications')}
        description={t('Updates about your cases and account.')}
        crumbs={[{ label: t('Dashboard'), to: roleHome(user.role) }, { label: t('Notifications') }]}
        actions={
          <Button
            variant="secondary"
            onClick={() => markAll.mutate()}
            disabled={!data || data.unreadCount === 0}
            loading={markAll.isPending}
          >
            <CheckCheck aria-hidden="true" /> {t('Mark all as read')}
          </Button>
        }
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <div role="status" aria-label={t('Loading notifications')} className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">{t('Loading…')}</span>
        </div>
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title={t('No notifications yet')}
            description={t('When something happens in your cases, it will show here.')}
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
                          <>
                            <span
                              className="me-2 inline-block size-2 rounded-full bg-primary align-middle"
                              aria-hidden="true"
                            />
                            <span className="sr-only">{t('Unread:')} </span>
                          </>
                        )}
                        {humanizeCodes(translateNotice(n.title, n.titleKey, n.params))}
                      </p>
                      <p className="break-words text-text-muted">
                        {humanizeCodes(translateNotice(n.body, n.bodyKey, n.params))}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">{formatDateTime(n.createdAt)}</p>
                      {notificationLink(n.type, user.role) && (
                        <Link
                          to={notificationLink(n.type, user.role) as string}
                          className="mt-1 inline-block text-sm font-semibold"
                        >
                          {n.type === 'CAUSE_LIST_PUBLISHED'
                            ? t('Open cause lists')
                            : t('Open hearing schedule')}
                        </Link>
                      )}
                    </div>
                    {!n.readAt && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markRead.mutate(n.id)}
                        aria-label={t('Mark "{{title}}" as read', {
                          title: translateNotice(n.title, n.titleKey, n.params),
                        })}
                      >
                        {t('Mark as read')}
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
