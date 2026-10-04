import { useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/** Layout for signed-in pages: header on top, role-based sidebar on the left, content on the right. */
export function AppShell() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

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
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
