import { Navigate, useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PORTAL_BY_SLUG } from '@/lib/navigation';
import { ComingSoonPage } from '@/pages/PortalPages';
import { NotFoundPage } from '@/pages/ErrorPages';
import BoardPage from './BoardPage';
import { CauseListsPage, HearingSchedulePage, JudgeSchedulePage } from './UserSchedulePages';

/**
 * /:portal/hearings, /:portal/cause-lists and /:portal/schedule: which page shows depends on the role.
 * Anything not built for a role keeps the "coming later" page.
 */
export function ScheduleFeatureRoute({
  feature,
}: {
  feature: 'hearings' | 'cause-lists' | 'schedule';
}) {
  const { portal: slug } = useParams();
  const { user } = useAuth();
  const portal = slug ? PORTAL_BY_SLUG[slug] : undefined;
  if (!portal) return <NotFoundPage />;
  if (!user || user.role !== portal.role) return <Navigate to="/forbidden" replace />;

  const role = user.role;
  if (feature === 'hearings') {
    if (role === 'ADMIN') return <BoardPage />;
    if (role === 'LITIGANT' || role === 'LAWYER') return <HearingSchedulePage />;
  }
  if (feature === 'cause-lists' && ['LITIGANT', 'LAWYER', 'JUDGE'].includes(role)) {
    return <CauseListsPage />;
  }
  if (feature === 'schedule' && role === 'JUDGE') return <JudgeSchedulePage />;
  return <ComingSoonPage feature={feature} />;
}
