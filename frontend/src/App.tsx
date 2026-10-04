import { Route, Routes } from 'react-router';
import { GuestOnly, RequireAuth } from '@/auth/guards';
import { useAuth } from '@/auth/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import CaseDetailPage from '@/pages/cases/CaseDetailPage';
import NewCasePage from '@/pages/cases/NewCasePage';
import PortfolioPage from '@/pages/cases/PortfolioPage';
import { CaseRoute, ComingSoonPage, PortalHome } from '@/pages/PortalPages';
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
        <Route element={<AppShell />}>
          <Route path="profile" element={<ProfilePage />} />
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
