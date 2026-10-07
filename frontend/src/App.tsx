import { Route, Routes } from 'react-router';
import { GuestOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { useAuth } from '@/auth/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';
import SummonsRegistryPage from '@/pages/admin/SummonsRegistryPage';
import AuditVaultPage from '@/pages/admin/AuditVaultPage';
import PerformancePage from '@/pages/admin/PerformancePage';
import SecurityAlertsPage from '@/pages/admin/SecurityAlertsPage';
import {
  VirtualCourtroomControlPage,
  VirtualCourtroomListPage,
} from '@/pages/admin/VirtualCourtroomPages';
import RoomPage from '@/pages/virtual/RoomPage';
import { ServerShell } from '@/pages/server/ServerShell';
import { RosterPage, ServerProfilePage, SummonsPage } from '@/pages/server/ServerPages';
import { AttemptPage, FinalizePage } from '@/pages/server/ProgressPages';
import { ChamberGate } from '@/pages/chamber/shared';
import ChamberDashboardPage from '@/pages/chamber/ChamberDashboardPage';
import { ClientDetailPage, ClientsPage, NewClientPage } from '@/pages/chamber/ClientsPages';
import BillablePage from '@/pages/chamber/BillablePage';
import RetainerPage from '@/pages/chamber/RetainerPage';
import ExpensesPage from '@/pages/chamber/ExpensesPage';
import { InternDetailPage, InternsPage, ResearchReviewPage } from '@/pages/chamber/InternsPages';
import ChamberSettingsPage from '@/pages/chamber/ChamberSettingsPage';
import ResearchLogsPage from '@/pages/intern/ResearchLogsPage';
import AttendancePage from '@/pages/intern/AttendancePage';
import FeedbackAnalysisPage from '@/pages/admin/FeedbackAnalysisPage';
import JudgeCaseDetailPage from '@/pages/judge/JudgeCaseDetailPage';
import JudgeOrdersPage from '@/pages/judge/JudgeOrdersPage';
import CertificatePage from '@/pages/intern/CertificatePage';
import ChallanPrintPage from '@/pages/payments/ChallanPrintPage';
import PayPage from '@/pages/payments/PayPage';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import { FeedbackPage, NotificationPreferencesPage } from '@/pages/profile/ProfileExtraPages';
import EvidenceIndexPage from '@/pages/cases/EvidenceIndexPage';
import AccountsPage from '@/pages/admin/AccountsPage';
import AdminCaseDetailPage from '@/pages/admin/AdminCaseDetailPage';
import AdminCasesPage from '@/pages/admin/AdminCasesPage';
import CourtsPage from '@/pages/admin/CourtsPage';
import LawyerVerificationPage from '@/pages/admin/LawyerVerificationPage';
import PoliciesPage from '@/pages/admin/PoliciesPage';
import JudgeCasesPage from '@/pages/judge/JudgeCasesPage';
import { ScheduleFeatureRoute } from '@/pages/scheduling/ScheduleRoutes';
import NotificationsPage from '@/pages/NotificationsPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import CaseDetailPage from '@/pages/cases/CaseDetailPage';
import NewCasePage from '@/pages/cases/NewCasePage';
import PortfolioPage from '@/pages/cases/PortfolioPage';
import { CaseRoute, ComingSoonPage, PortalHome } from '@/pages/PortalPages';
import { FinanceRoute } from '@/pages/payments/FinanceRoute';
import ProfilePage from '@/pages/ProfilePage';
import RegisterPage from '@/pages/RegisterPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

/** 403 and 404 use the signed-in shell when there is a session, and the public layout otherwise. */
function AdaptiveLayout() {
  const { user } = useAuth();
  return user ? <AppShell /> : <PublicLayout />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
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
            <Route path="process-server/summons/:summonsId/finalize" element={<FinalizePage />} />
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
          <Route path=":portal/hearings" element={<ScheduleFeatureRoute feature="hearings" />} />
          <Route
            path=":portal/cause-lists"
            element={<ScheduleFeatureRoute feature="cause-lists" />}
          />
          <Route path=":portal/schedule" element={<ScheduleFeatureRoute feature="schedule" />} />
          <Route path=":portal/:feature" element={<ComingSoonPage />} />
        </Route>
      </Route>

      <Route element={<AdaptiveLayout />}>
        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
