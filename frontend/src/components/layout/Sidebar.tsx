import { useQuery } from '@tanstack/react-query';
import { UserCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { adminApi } from '@/lib/admin-api';
import { securityApi } from '@/lib/phase4e-api';
import { PORTALS, portalPath } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-10 items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm font-medium no-underline',
    isActive
      ? 'border-accent bg-primary-soft font-semibold text-primary'
      : 'border-transparent text-text hover:bg-primary-soft',
  );

/** Number of lawyers waiting for approval, shown next to the Lawyer Verification link. */
function PendingLawyersBadge() {
  const { data } = useQuery({
    queryKey: ['admin', 'lawyers', 'pending-count'],
    queryFn: async () =>
      (await adminApi.lawyers({ status: 'PENDING', page: 1, limit: 1 })).counts.PENDING,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-accent px-2 text-center text-xs font-bold leading-6 text-text">
      <span className="sr-only">Pending approvals: </span>
      {data}
    </span>
  );
}

/** Number of open security alerts, shown next to the Security Alerts link. */
function OpenAlertsBadge() {
  const { data } = useQuery({
    queryKey: ['admin', 'security', 'summary'],
    queryFn: async () => (await securityApi.summary()).openCount,
    refetchInterval: 30_000,
  });
  if (!data) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-destructive px-2 text-center text-xs font-bold leading-6 text-white">
      <span className="sr-only">Open alerts: </span>
      {data}
    </span>
  );
}

/** Role-based navigation. A fixed column on desktop, a slide-in drawer below 1024px. */
export function Sidebar({
  role,
  open,
  onClose,
}: {
  role: Role;
  open: boolean;
  onClose: () => void;
}) {
  const portal = PORTALS[role];
  const { user } = useAuth();
  // Chamber features exist only for verified lawyers; others see a short note instead of the group.
  const chamberLocked = role === 'LAWYER' && user?.lawyerProfile?.verificationStatus !== 'VERIFIED';
  const items = portal.items.filter((i) => !(chamberLocked && i.group === 'Chamber'));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[rgba(26,26,26,0.5)] lg:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <aside
        id="portal-sidebar"
        className={cn(
          'no-print fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-border bg-surface transition-transform lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className="font-heading text-sm font-bold text-text">{portal.label}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex size-10 items-center justify-center rounded-md hover:bg-primary-soft lg:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Portal navigation" className="px-2 pb-4">
          <ul className="space-y-0.5">
            {items.map((item, index) => (
              <li key={item.slug || 'home'}>
                {item.group && items[index - 1]?.group !== item.group && (
                  <p className="mb-1 mt-4 border-t border-border px-3 pt-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                    {item.group}
                  </p>
                )}
                <NavLink
                  to={portalPath(portal, item.slug)}
                  end
                  className={linkClass}
                  onClick={onClose}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                  {role === 'ADMIN' && item.slug === 'lawyer-verification' && (
                    <PendingLawyersBadge />
                  )}
                  {role === 'ADMIN' && item.slug === 'security' && <OpenAlertsBadge />}
                </NavLink>
              </li>
            ))}
          </ul>
          {chamberLocked && (
            <p className="mx-3 mt-4 rounded-md border border-border bg-primary-soft p-2 text-xs">
              The Chamber section opens once your lawyer account is verified.
            </p>
          )}
          <hr className="my-3 border-border" />
          <NavLink to="/profile" className={linkClass} onClick={onClose}>
            <UserCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>My Profile</span>
          </NavLink>
        </nav>
      </aside>
    </>
  );
}
