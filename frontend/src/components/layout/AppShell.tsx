import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TableSkeleton } from '@/components/ui/skeleton';
import { FOCUS_KEY } from '@/lib/heading-focus';
import { useAuth } from '@/auth/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

// The guided tour (and driver.js) load in their own chunks.
const TourController = lazy(() =>
  import('@/components/tour/TourController').then((m) => ({ default: m.TourController })),
);

import { useTranslation } from 'react-i18next';

/**
 * After login, waits (up to 5 s) for the page heading to render and focuses it. The request flag is cleared only
 * once the heading has focus (or on timeout), because the shell can remount while the first page loads.
 */
function useHeadingFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    const read = () => {
      try {
        return sessionStorage.getItem(FOCUS_KEY);
      } catch {
        return null;
      }
    };
    const clear = () => {
      try {
        sessionStorage.removeItem(FOCUS_KEY);
      } catch {
        // storage unavailable
      }
    };
    const requested = read();
    if (!requested) return;
    // The flag holds the request time; an old one (from an interrupted login) is ignored.
    const deadline = Number(requested) + 5000;
    let frame = 0;
    const tryFocus = () => {
      if (Date.now() > deadline) return clear();
      const active = document.activeElement;
      if (active && active !== document.body && active.tagName !== 'H1') return clear(); // user moved on
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1 && active !== h1) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      }
      // Keep watching briefly: a data load can replace the heading element and drop focus to <body>.
      frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}

/** Layout for signed-in pages: header on top, role-based sidebar on the left, content on the right. */
export function AppShell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useHeadingFocus();

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-primary"
      >
        {t('Skip to main content')}
      </a>
      <Suspense fallback={null}>
        <TourController />
      </Suspense>
      <Header onMenuClick={() => setMenuOpen((o) => !o)} menuOpen={menuOpen} />
      <div className="flex flex-1">
        <Sidebar role={user.role} open={menuOpen} onClose={closeMenu} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Suspense fallback={<TableSkeleton rows={6} cols={4} />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
