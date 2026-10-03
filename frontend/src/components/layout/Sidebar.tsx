import { UserCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink } from 'react-router';
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
            {portal.items.map((item) => (
              <li key={item.slug || 'home'}>
                <NavLink
                  to={portalPath(portal, item.slug)}
                  end
                  className={linkClass}
                  onClick={onClose}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
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
