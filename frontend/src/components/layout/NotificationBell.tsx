import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { notificationsApi } from '@/lib/admin-api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const NOTIFICATIONS_KEY = ['notifications'];
const POLL_MS = 60_000;

/** Header bell: unread badge, latest notifications, mark as read. Polls every 60 seconds. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'latest'],
    queryFn: () => notificationsApi.list({ page: 1, limit: 6 }),
    refetchInterval: POLL_MS,
  });
  const unread = data?.unreadCount ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });
  const markAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex size-10 items-center justify-center rounded-md hover:bg-primary-hover focus-visible:outline-white"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold leading-5 text-text">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface text-text shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-heading text-sm font-bold">Notifications</p>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-50"
            >
              <CheckCheck className="size-4" aria-hidden="true" /> Mark all as read
            </button>
          </div>
          {!data || data.data.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              You have no notifications yet.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {data.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.readAt && markRead.mutate(n.id)}
                    className={cn(
                      'block w-full px-4 py-3 text-left hover:bg-primary-soft',
                      !n.readAt && 'bg-row-alt',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {!n.readAt && (
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{n.title}</span>
                        <span className="block break-words text-sm text-text-muted">{n.body}</span>
                        <span className="mt-0.5 block text-xs text-text-muted">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-2 text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
