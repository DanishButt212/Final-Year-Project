import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { GuestOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { useAuth } from '@/auth/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { DocumentTitle } from '@/components/layout/DocumentTitle';
import { PageLoading } from '@/components/layout/PageLoading';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';
import { ServerShell } from '@/pages/server/ServerShell';
import { ChamberGate } from '@/pages/chamber/shared';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

const PublicStatusPage = lazy(() => import('@/pages/PublicStatusPage'));
/** Route pages are loaded on demand (one chunk per page); layouts, guards and the public auth pages load eagerly. */
const CaseRoute = lazy(() => import('@/pages/PortalPages').then((m) => ({ default: m.CaseRoute })));
const ComingSoonPage = lazy(() =>
  import('@/pages/PortalPages').then((m) => ({ default: m.ComingSoonPage })),
);
const PortalHome = lazy(() =>
  import('@/pages/PortalPages').then((m) => ({ default: m.PortalHome })),
);
const ScheduleFeatureRoute = lazy(() =>
  import('@/pages/scheduling/ScheduleRoutes').then((m) => ({ default: m.ScheduleFeatureRoute })),
);
const FinanceRoute = lazy(() =>
  import('@/pages/payments/FinanceRoute').then((m) => ({ default: m.FinanceRoute })),
);
const SummonsRegistryPage = lazy(() => import('@/pages/admin/SummonsRegistryPage'));
const AuditVaultPage = lazy(() => import('@/pages/admin/AuditVaultPage'));
const PerformancePage = lazy(() => import('@/pages/admin/PerformancePage'));
const SecurityAlertsPage = lazy(() => import('@/pages/admin/SecurityAlertsPage'));
const RoomPage = lazy(() => import('@/pages/virtual/RoomPage'));
const ChamberDashboardPage = lazy(() => import('@/pages/chamber/ChamberDashboardPage'));
const BillablePage = lazy(() => import('@/pages/chamber/BillablePage'));
const RetainerPage = lazy(() => import('@/pages/chamber/RetainerPage'));
const ExpensesPage = lazy(() => import('@/pages/chamber/ExpensesPage'));
const ChamberSettingsPage = lazy(() => import('@/pages/chamber/ChamberSettingsPage'));
const ResearchLogsPage = lazy(() => import('@/pages/intern/ResearchLogsPage'));
const AttendancePage = lazy(() => import('@/pages/intern/AttendancePage'));
const FeedbackAnalysisPage = lazy(() => import('@/pages/admin/FeedbackAnalysisPage'));
const JudgeCaseDetailPage = lazy(() => import('@/pages/judge/JudgeCaseDetailPage'));
const JudgeOrdersPage = lazy(() => import('@/pages/judge/JudgeOrdersPage'));
const CertificatePage = lazy(() => import('@/pages/intern/CertificatePage'));
const ChallanPrintPage = lazy(() => import('@/pages/payments/ChallanPrintPage'));
const PayPage = lazy(() => import('@/pages/payments/PayPage'));
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage'));
const EvidenceIndexPage = lazy(() => import('@/pages/cases/EvidenceIndexPage'));
const AccountsPage = lazy(() => import('@/pages/admin/AccountsPage'));
const AdminCaseDetailPage = lazy(() => import('@/pages/admin/AdminCaseDetailPage'));
const AdminCasesPage = lazy(() => import('@/pages/admin/AdminCasesPage'));
const CourtsPage = lazy(() => import('@/pages/admin/CourtsPage'));
const LawyerVerificationPage = lazy(() => import('@/pages/admin/LawyerVerificationPage'));
const PoliciesPage = lazy(() => import('@/pages/admin/PoliciesPage'));
const JudgeCasesPage = lazy(() => import('@/pages/judge/JudgeCasesPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const CaseDetailPage = lazy(() => import('@/pages/cases/CaseDetailPage'));
const NewCasePage = lazy(() => import('@/pages/cases/NewCasePage'));
const PortfolioPage = lazy(() => import('@/pages/cases/PortfolioPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const VirtualCourtroomControlPage = lazy(() =>
  import('@/pages/admin/VirtualCourtroomPages').then((m) => ({
    default: m.VirtualCourtroomControlPage,
  })),
);
const VirtualCourtroomListPage = lazy(() =>
  import('@/pages/admin/VirtualCourtroomPages').then((m) => ({
    default: m.VirtualCourtroomListPage,
  })),
);
const RosterPage = lazy(() =>
  import('@/pages/server/ServerPages').then((m) => ({ default: m.RosterPage })),
);
const ServerProfilePage = lazy(() =>
  import('@/pages/server/ServerPages').then((m) => ({ default: m.ServerProfilePage })),
);
const SummonsPage = lazy(() =>
  import('@/pages/server/ServerPages').then((m) => ({ default: m.SummonsPage })),
);
const AttemptPage = lazy(() =>
  import('@/pages/server/ProgressPages').then((m) => ({ default: m.AttemptPage })),
);
const FinalizePage = lazy(() =>
  import('@/pages/server/ProgressPages').then((m) => ({ default: m.FinalizePage })),
);
const ClientDetailPage = lazy(() =>
  import('@/pages/chamber/ClientsPages').then((m) => ({ default: m.ClientDetailPage })),
);
const ClientsPage = lazy(() =>
  import('@/pages/chamber/ClientsPages').then((m) => ({ default: m.ClientsPage })),
);
const NewClientPage = lazy(() =>
  import('@/pages/chamber/ClientsPages').then((m) => ({ default: m.NewClientPage })),
);
const InternDetailPage = lazy(() =>
  import('@/pages/chamber/InternsPages').then((m) => ({ default: m.InternDetailPage })),
);
const InternsPage = lazy(() =>
  import('@/pages/chamber/InternsPages').then((m) => ({ default: m.InternsPage })),
);
const ResearchReviewPage = lazy(() =>
  import('@/pages/chamber/InternsPages').then((m) => ({ default: m.ResearchReviewPage })),
);
const FeedbackPage = lazy(() =>
  import('@/pages/profile/ProfileExtraPages').then((m) => ({ default: m.FeedbackPage })),
);
const NotificationPreferencesPage = lazy(() =>
  import('@/pages/profile/ProfileExtraPages').then((m) => ({
    default: m.NotificationPreferencesPage,
  })),
);

/** 403 and 404 use the signed-in shell when there is a session, and the public layout otherwise. */
function AdaptiveLayout() {
  const { user } = useAuth();
  return user ? <AppShell /> : <PublicLayout />;
}

export default function App() {
  return (
    <>
      <DocumentTitle />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="status" element={<Navigate to="/#case-status" replace />} />
            <Route path="status/:ucn" element={<PublicStatusPage />} />
            <Route element={<GuestOnly />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
            </Route>
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="courtroom/:hearingId" element={<RoomPage />} />
            <Route element={<RequireRole role="PROCESS_SERVER" />}>
              <Route element={<ServerShell />}>
                <Route path="process-server" element={<RosterPage />} />
                <Route path="process-server/profile" element={<ServerProfilePage />} />
                <Route path="process-server/summons/:summonsId" element={<SummonsPage />} />
                <Route path="process-server/summons/:summonsId/attempt" element={<AttemptPage />} />
                <Route
                  path="process-server/summons/:summonsId/finalize"
                  element={<FinalizePage />}
                />
              </Route>
            </Route>
            <Route element={<AppShell />}>
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route
                path="profile/notification-preferences"
                element={<NotificationPreferencesPage />}
              />
              <Route path="profile/feedback" element={<FeedbackPage />} />
              <Route element={<RequireRole role="ADMIN" />}>
                <Route path="admin/accounts" element={<AccountsPage />} />
                <Route path="admin/lawyer-verification" element={<LawyerVerificationPage />} />
                <Route path="admin/cases" element={<AdminCasesPage />} />
                <Route path="admin/cases/:caseId" element={<AdminCaseDetailPage />} />
                <Route path="admin/courts" element={<CourtsPage />} />
                <Route path="admin/policies" element={<PoliciesPage />} />
                <Route path="admin/feedback" element={<FeedbackAnalysisPage />} />
                <Route path="admin/summons" element={<SummonsRegistryPage />} />
                <Route path="admin/audit-logs" element={<AuditVaultPage />} />
                <Route path="admin/security" element={<SecurityAlertsPage />} />
                <Route path="admin/reports" element={<PerformancePage />} />
                <Route path="admin/virtual-courtroom" element={<VirtualCourtroomListPage />} />
                <Route
                  path="admin/virtual-courtroom/:sessionId"
                  element={<VirtualCourtroomControlPage />}
                />
              </Route>
              <Route element={<RequireRole role="LAWYER" />}>
                <Route element={<ChamberGate />}>
                  <Route path="lawyer/chamber" element={<ChamberDashboardPage />} />
                  <Route path="lawyer/chamber/clients" element={<ClientsPage />} />
                  <Route path="lawyer/chamber/clients/new" element={<NewClientPage />} />
                  <Route path="lawyer/chamber/clients/:clientId" element={<ClientDetailPage />} />
                  <Route path="lawyer/chamber/billable" element={<BillablePage />} />
                  <Route path="lawyer/chamber/retainer" element={<RetainerPage />} />
                  <Route path="lawyer/chamber/expenses" element={<ExpensesPage />} />
                  <Route path="lawyer/chamber/interns" element={<InternsPage />} />
                  <Route path="lawyer/chamber/interns/:internId" element={<InternDetailPage />} />
                  <Route path="lawyer/chamber/research-logs" element={<ResearchReviewPage />} />
                  <Route path="lawyer/chamber/settings" element={<ChamberSettingsPage />} />
                </Route>
              </Route>
              <Route element={<RequireRole role="INTERN" />}>
                <Route path="intern/research-logs" element={<ResearchLogsPage />} />
                <Route path="intern/attendance" element={<AttendancePage />} />
                <Route path="intern/certificate" element={<CertificatePage />} />
              </Route>
              <Route element={<RequireRole role="JUDGE" />}>
                <Route path="judge/cases" element={<JudgeCasesPage />} />
                <Route path="judge/cases/:caseId" element={<JudgeCaseDetailPage />} />
                <Route path="judge/orders" element={<JudgeOrdersPage />} />
              </Route>
              <Route path=":portal" element={<PortalHome />} />
              <Route
                path=":portal/new-case"
                element={
                  <CaseRoute feature="new-case">
                    <NewCasePage />
                  </CaseRoute>
                }
              />
              <Route
                path=":portal/cases"
                element={
                  <CaseRoute feature="cases">
                    <PortfolioPage />
                  </CaseRoute>
                }
              />
              <Route
                path=":portal/cases/:caseId"
                element={
                  <CaseRoute detail feature="cases">
                    <CaseDetailPage />
                  </CaseRoute>
                }
              />
              <Route
                path=":portal/payments"
                element={
                  <FinanceRoute>
                    <PaymentsPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/pay/:challanId"
                element={
                  <FinanceRoute>
                    <PayPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/cases/:caseId/challan"
                element={
                  <FinanceRoute>
                    <ChallanPrintPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/evidence"
                element={
                  <FinanceRoute>
                    <EvidenceIndexPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/notifications"
                element={
                  <FinanceRoute>
                    <NotificationPreferencesPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/feedback"
                element={
                  <FinanceRoute>
                    <FeedbackPage />
                  </FinanceRoute>
                }
              />
              <Route
                path=":portal/hearings"
                element={<ScheduleFeatureRoute feature="hearings" />}
              />
              <Route
                path=":portal/cause-lists"
                element={<ScheduleFeatureRoute feature="cause-lists" />}
              />
              <Route
                path=":portal/schedule"
                element={<ScheduleFeatureRoute feature="schedule" />}
              />
              <Route path=":portal/:feature" element={<ComingSoonPage />} />
            </Route>
          </Route>

          <Route element={<AdaptiveLayout />}>
            <Route path="forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
