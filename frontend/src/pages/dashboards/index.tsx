import { Archive, Clock, GraduationCap, Receipt, Users } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/ui/alert';
import { LAWYER_PENDING_MESSAGE } from '@/hooks/use-filing-gate';
import { DashboardFrame, EmptyPanel, PanelGrid } from './parts';
import AnalyticsBoard from '../admin/AnalyticsBoard';
import { NextHearingCard } from '../scheduling/UserSchedulePages';
import { MyAllocatedCases } from '../judge/JudgeCasesPage';
import { RecentOrdersPanel, TodayHearingsPanel } from '../judge/JudgeDashboardPanels';
import CaseOverview from './CaseOverview';
import { ChamberIdCard } from '../chamber/ChamberIdCard';

export function LitigantDashboard() {
  return (
    <DashboardFrame description="Your cases, hearings and payments at a glance.">
      <CaseOverview />
      <PanelGrid>
        <NextHearingCard />
        <EmptyPanel
          title="Court fee challans"
          icon={Receipt}
          emptyTitle="Nothing to pay"
          emptyText="Challans for your filings and their receipts will appear here."
          actionLabel="Challans & payments"
          actionTo="/litigant/payments"
        />
        <EmptyPanel
          title="Evidence vault"
          icon={Archive}
          emptyTitle="No evidence stored"
          emptyText="Upload and organise evidence for your cases."
          actionLabel="Open evidence vault"
          actionTo="/litigant/evidence"
        />
      </PanelGrid>
    </DashboardFrame>
  );
}

export function LawyerDashboard() {
  const { user } = useAuth();
  const status = user?.lawyerProfile?.verificationStatus;
  return (
    <DashboardFrame description="Your chamber, clients and cases at a glance.">
      {status === 'PENDING' && (
        <Alert variant="info" title="Verification pending" className="mb-6">
          {LAWYER_PENDING_MESSAGE}
        </Alert>
      )}
      {status === 'VERIFIED' && <ChamberIdCard />}
      <CaseOverview />
      {status === 'REJECTED' && (
        <Alert variant="error" title="Verification rejected" className="mb-6">
          Your Bar Council registration could not be verified. Please contact the registrar.
        </Alert>
      )}
      {status === 'VERIFIED' && (
        <Alert variant="success" title="Verified lawyer" className="mb-6">
          Your Bar Council registration has been verified.
        </Alert>
      )}
      <PanelGrid>
        <EmptyPanel
          title="Clients"
          icon={Users}
          emptyTitle="No clients yet"
          emptyText="Add the people your chamber represents."
          actionLabel="Manage clients"
          actionTo="/lawyer/chamber/clients"
        />
        <EmptyPanel
          title="Billable hours"
          icon={Clock}
          emptyTitle="No time recorded"
          emptyText="Record time against clients and cases to bill accurately."
          actionLabel="Billable hours"
          actionTo="/lawyer/chamber/billable"
        />
        <EmptyPanel
          title="Interns"
          icon={GraduationCap}
          emptyTitle="No interns assigned"
          emptyText="Legal interns supervised by you will appear here."
          actionLabel="View interns"
          actionTo="/lawyer/chamber/interns"
        />
        <NextHearingCard />
      </PanelGrid>
    </DashboardFrame>
  );
}

export { default as InternDashboard } from '../intern/InternDashboardPage';

export function JudgeDashboard() {
  return (
    <DashboardFrame description="Today's cause list and your caseload.">
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TodayHearingsPanel />
        <RecentOrdersPanel />
      </div>
      <MyAllocatedCases />
    </DashboardFrame>
  );
}

export function AdminDashboard() {
  return (
    <DashboardFrame description="Live metrics for the whole court system.">
      <AnalyticsBoard />
    </DashboardFrame>
  );
}
