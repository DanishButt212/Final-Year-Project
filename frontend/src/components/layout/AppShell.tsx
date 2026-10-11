import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TableSkeleton } from '@/components/ui/skeleton';
import { FOCUS_KEY } from '@/lib/heading-focus';
import { useAuth } from '@/auth/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/** Waits (up to 3 s) for the page heading to render, then focuses it once. */
function useHeadingFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    let flagged: boolean;
    try {
      flagged = sessionStorage.getItem(FOCUS_KEY) === '1';
      sessionStorage.removeItem(FOCUS_KEY);
    } catch {
      return;
    }
    if (!flagged) return;
    const started = Date.now();
    let frame = 0;
    const tryFocus = () => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      } else if (Date.now() - started < 3000) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}

/** Layout for signed-in pages: header on top, role-based sidebar on the left, content on the right. */
export function AppShell() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useHeadingFocus();

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-primary"
      >
        Skip to main content
      </a>
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
