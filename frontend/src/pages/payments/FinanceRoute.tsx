import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PORTAL_BY_SLUG } from '@/lib/navigation';
import { NotFoundPage } from '@/pages/ErrorPages';

/** Pages that only litigants and lawyers have (payments, challans, vault index, preferences, feedback). */
export function FinanceRoute({ children }: { children: ReactNode }) {
  const { portal: slug } = useParams();
  const { user } = useAuth();
  const portal = slug ? PORTAL_BY_SLUG[slug] : undefined;
  if (!portal) return <NotFoundPage />;
  if (!user || user.role !== portal.role) return <Navigate to="/forbidden" replace />;
  if (user.role !== 'LITIGANT' && user.role !== 'LAWYER') return <NotFoundPage />;
  return <>{children}</>;
}
