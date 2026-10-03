import { Hammer } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PORTAL_BY_SLUG, portalPath } from '@/lib/navigation';
import { NotFoundPage } from './ErrorPages';
import {
  AdminDashboard,
  InternDashboard,
  JudgeDashboard,
  LawyerDashboard,
  LitigantDashboard,
  ProcessServerPage,
} from './dashboards';

const DASHBOARDS = {
  LITIGANT: LitigantDashboard,
  LAWYER: LawyerDashboard,
  INTERN: InternDashboard,
  JUDGE: JudgeDashboard,
  ADMIN: AdminDashboard,
  PROCESS_SERVER: ProcessServerPage,
} as const;

/** /:portal → the dashboard for that portal, but only for users who belong to it. */
export function PortalHome() {
  const { portal: slug } = useParams();
  const { user } = useAuth();
  const portal = slug ? PORTAL_BY_SLUG[slug] : undefined;
  if (!portal) return <NotFoundPage />;
  if (!user || user.role !== portal.role) return <Navigate to="/forbidden" replace />;
  const Dashboard = DASHBOARDS[portal.role];
  return <Dashboard />;
}

/** /:portal/:feature → a clear "later phase" page for every sidebar item. */
export function ComingSoonPage() {
  const { portal: slug, feature } = useParams();
  const { user } = useAuth();
  const portal = slug ? PORTAL_BY_SLUG[slug] : undefined;
  if (!portal) return <NotFoundPage />;
  if (!user || user.role !== portal.role) return <Navigate to="/forbidden" replace />;
  const item = portal.items.find((i) => i.slug === feature);
  if (!item || !item.slug) return <NotFoundPage />;

  return (
    <>
      <PageHeader
        title={item.label}
        description={item.description}
        crumbs={[{ label: 'Dashboard', to: portalPath(portal, '') }, { label: item.label }]}
      />
      <Card className="max-w-2xl">
        <EmptyState
          icon={Hammer}
          title="Coming in a later phase"
          description={`${item.label} is planned but not built yet. This page will be replaced when the feature is delivered.`}
          action={
            <Button asChild variant="secondary">
              <Link to={portalPath(portal, '')}>Back to dashboard</Link>
            </Button>
          }
        />
      </Card>
    </>
  );
}
