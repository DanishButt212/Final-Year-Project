import { Archive, Clock, GraduationCap, Receipt, Users } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/ui/alert';
import { LAWYER_PENDING_MESSAGE } from '@/hooks/use-filing-gate';
import { DashboardFrame, EmptyPanel, PanelGrid } from './parts';
import AnalyticsBoard from '../admin/AnalyticsBoard';
import { NextHearingCard } from '@/components/hearing/NextHearingCard';
import { MyAllocatedCases } from '../judge/JudgeCasesPage';
import { RecentOrdersPanel, TodayHearingsPanel } from '../judge/JudgeDashboardPanels';
import CaseOverview from './CaseOverview';
import { ChamberIdCard } from '../chamber/ChamberIdCard';
import { useTranslation } from 'react-i18next';

export function LitigantDashboard() {
  const { t } = useTranslation();
  return (
    <DashboardFrame description={t('Your cases, hearings and payments at a glance.')}>
      <CaseOverview />
      <PanelGrid>
        <NextHearingCard />
        <EmptyPanel
          title={t('Court fee challans')}
          icon={Receipt}
          emptyTitle={t('Nothing to pay')}
          emptyText={t('Challans for your filings and their receipts will appear here.')}
          actionLabel={t('Challans & payments')}
          actionTo="/litigant/payments"
        />
        <EmptyPanel
          title={t('Evidence vault')}
          icon={Archive}
          emptyTitle={t('No evidence stored')}
          emptyText={t('Upload and organise evidence for your cases.')}
          actionLabel={t('Open evidence vault')}
          actionTo="/litigant/evidence"
        />
      </PanelGrid>
    </DashboardFrame>
  );
}

export function LawyerDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const status = user?.lawyerProfile?.verificationStatus;
  return (
    <DashboardFrame description={t('Your chamber, clients and cases at a glance.')}>
      {status === 'PENDING' && (
        <Alert variant="info" title={t('Verification pending')} className="mb-6">
          {t(LAWYER_PENDING_MESSAGE)}
        </Alert>
      )}
      {status === 'VERIFIED' && <ChamberIdCard />}
      <CaseOverview />
      {status === 'REJECTED' && (
        <Alert variant="error" title={t('Verification rejected')} className="mb-6">
          {t('Your Bar Council registration could not be verified. Please contact the registrar.')}
        </Alert>
      )}
      {status === 'VERIFIED' && (
        <Alert variant="success" title={t('Verified lawyer')} className="mb-6">
          {t('Your Bar Council registration has been verified.')}
        </Alert>
      )}
      <PanelGrid>
        <EmptyPanel
          title={t('Clients')}
          icon={Users}
          emptyTitle={t('No clients yet')}
          emptyText={t('Add the people your chamber represents.')}
          actionLabel={t('Manage clients')}
          actionTo="/lawyer/chamber/clients"
        />
        <EmptyPanel
          title={t('Billable hours')}
          icon={Clock}
          emptyTitle={t('No time recorded')}
          emptyText={t('Record time against clients and cases to bill accurately.')}
          actionLabel={t('Billable hours')}
          actionTo="/lawyer/chamber/billable"
        />
        <EmptyPanel
          title={t('Interns')}
          icon={GraduationCap}
          emptyTitle={t('No interns assigned')}
          emptyText={t('Legal interns supervised by you will appear here.')}
          actionLabel={t('View interns')}
          actionTo="/lawyer/chamber/interns"
        />
        <NextHearingCard />
      </PanelGrid>
    </DashboardFrame>
  );
}

export { default as InternDashboard } from '../intern/InternDashboardPage';

export function JudgeDashboard() {
  const { t } = useTranslation();
  return (
    <DashboardFrame description={t("Today's cause list and your caseload.")}>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <NextHearingCard />
        <TodayHearingsPanel />
      </div>
      <div className="mb-6">
        <RecentOrdersPanel />
      </div>
      <MyAllocatedCases />
    </DashboardFrame>
  );
}

export function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <DashboardFrame description={t('Live metrics for the whole court system.')}>
      <AnalyticsBoard />
    </DashboardFrame>
  );
}
