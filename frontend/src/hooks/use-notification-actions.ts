import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toaster';
import { notificationsApi, type AppNotification } from '@/lib/admin-api';
import { parseApiError } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { NOTIFICATIONS_KEY } from '@/lib/query-keys';

type Page = Paginated<AppNotification> & { unreadCount: number };

/**
 * Mark one or all notifications read. The bell and the notifications page update at once (optimistic);
 * if the server refuses, every cached list is restored and an error toast explains it.
 */
export function useNotificationActions() {
  const queryClient = useQueryClient();

  const optimistic = async (apply: (page: Page) => Page) => {
    await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
    const snapshot = queryClient.getQueriesData<Page>({ queryKey: NOTIFICATIONS_KEY });
    queryClient.setQueriesData<Page>({ queryKey: NOTIFICATIONS_KEY }, (old) =>
      old && Array.isArray(old.data) ? apply(old) : old,
    );
    return { snapshot };
  };
  const rollback = (
    e: unknown,
    _v: unknown,
    ctx?: { snapshot: [readonly unknown[], Page | undefined][] },
  ) => {
    ctx?.snapshot.forEach(([key, value]) => queryClient.setQueryData(key, value));
    toast.error(parseApiError(e).message);
  };
  const settle = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  const now = () => new Date().toISOString();

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onMutate: (id: string) =>
      optimistic((page) => {
        const wasUnread = page.data.some((n) => n.id === id && !n.readAt);
        return {
          ...page,
          unreadCount: Math.max(0, page.unreadCount - (wasUnread ? 1 : 0)),
          data: page.data.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now() } : n)),
        };
      }),
    onError: rollback,
    onSettled: settle,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.readAll,
    onMutate: () =>
      optimistic((page) => ({
        ...page,
        unreadCount: 0,
        data: page.data.map((n) => (n.readAt ? n : { ...n, readAt: now() })),
      })),
    onError: rollback,
    onSettled: settle,
  });

  return { markRead, markAll };
}
