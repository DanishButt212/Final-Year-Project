import { LogIn, UserPlus } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { roleHome } from '@/lib/navigation';
import { Logo } from './Logo';

/** Layout for guests: landing, login, register and password pages. */
export function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-primary"
      >
        Skip to main content
      </a>
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            {user ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={roleHome(user.role)}>My dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/login">
                    <LogIn aria-hidden="true" /> Log in
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="border border-white/70 bg-transparent hover:bg-primary-hover"
                >
                  <Link to="/register">
                    <UserPlus aria-hidden="true" /> Register
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-text-muted">
          DigitalAdaalat is a final year academic project. It is not an official government or court
          service.
        </div>
      </footer>
    </div>
  );
}
