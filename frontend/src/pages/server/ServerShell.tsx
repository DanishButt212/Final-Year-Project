import { LanguageToggle } from '@/components/preferences/PreferenceControls';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/ui/skeleton';
import { ClipboardList, LogOut, UserCircle } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Logo } from '@/components/layout/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] text-sm font-semibold no-underline',
    isActive
      ? 'border-accent bg-primary-soft text-primary'
      : 'border-transparent text-text hover:bg-primary-soft',
  );

/** Mobile-first layout of the process server console: top bar, content and a bottom navigation. */
export function ServerShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  async function handleLogout() {
    await logout();
    toast.success(t('Logged out successfully.'));
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-primary"
      >
        {t('Skip to main content')}
      </a>
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <Logo to="/process-server" />
          <div className="flex items-center gap-1">
            <LanguageToggle tone="inverse" className="me-1 hidden sm:inline-flex" />
            <NotificationBell />
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t('Log out')}
              className="flex size-11 items-center justify-center rounded-md hover:bg-primary-hover focus-visible:outline-white"
            >
              <LogOut className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5">
        <Suspense fallback={<TableSkeleton rows={4} cols={2} />}>
          <Outlet />
        </Suspense>
      </main>
      <nav
        aria-label={t('Console navigation')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface"
      >
        <div className="mx-auto flex max-w-3xl">
          <NavLink to="/process-server" end className={tab}>
            <ClipboardList className="size-6" aria-hidden="true" />
            {t('Duty Roster')}
          </NavLink>
          <NavLink to="/process-server/profile" className={tab}>
            <UserCircle className="size-6" aria-hidden="true" />
            {t('Profile')}
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
