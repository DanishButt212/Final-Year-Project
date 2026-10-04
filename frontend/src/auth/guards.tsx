import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { roleHome } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import { useAuth } from './useAuth';

function FullPageLoader() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-3xl space-y-4 p-8">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Pages that need a signed-in user. Guests are sent to /login and returned afterwards. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login, register and reset pages: signed-in users go straight to their own dashboard. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return <Outlet />;
}

/** Routes that belong to one role only; everyone else gets the 403 page. */
export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth();
  if (user && user.role !== role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
