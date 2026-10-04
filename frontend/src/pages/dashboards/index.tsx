import {
  Archive,
  ClipboardList,
  Clock,
  GraduationCap,
  MapPin,
  NotebookPen,
  Receipt,
  Smartphone,
  Users,
  Award,
  Gavel,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { LAWYER_PENDING_MESSAGE } from '@/hooks/use-filing-gate';
import { DashboardFrame, EmptyPanel, PanelGrid } from './parts';
import AnalyticsBoard from '../admin/AnalyticsBoard';
import { NextHearingCard } from '../scheduling/UserSchedulePages';
import { MyAllocatedCases } from '../judge/JudgeCasesPage';
import CaseOverview from './CaseOverview';

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
          actionTo="/lawyer/clients"
        />
        <EmptyPanel
          title="Billable hours"
          icon={Clock}
          emptyTitle="No time recorded"
          emptyText="Record time against clients and cases to bill accurately."
          actionLabel="Billable hours"
          actionTo="/lawyer/billable-hours"
        />
        <EmptyPanel
          title="Interns"
          icon={GraduationCap}
          emptyTitle="No interns assigned"
          emptyText="Legal interns supervised by you will appear here."
          actionLabel="View interns"
          actionTo="/lawyer/interns"
        />
        <NextHearingCard />
      </PanelGrid>
    </DashboardFrame>
  );
}

export function InternDashboard() {
  return (
    <DashboardFrame description="Your diary, attendance and progress.">
      <PanelGrid>
        <EmptyPanel
          title="Daily diary"
          icon={NotebookPen}
          emptyTitle="No diary entries"
          emptyText="Write a short entry each day for your supervisor to review."
          actionLabel="Open diary"
          actionTo="/intern/diary"
        />
        <EmptyPanel
          title="Attendance"
          icon={MapPin}
          emptyTitle="No attendance recorded"
          emptyText="Check in when you are within the chamber's geo-fence."
          actionLabel="Mark attendance"
          actionTo="/intern/attendance"
        />
        <EmptyPanel
          title="Completion certificate"
          icon={Award}
          emptyTitle="Not available yet"
          emptyText="Your certificate is issued after your internship is completed."
          actionLabel="View certificate"
          actionTo="/intern/certificate"
        />
      </PanelGrid>
    </DashboardFrame>
  );
}

export function JudgeDashboard() {
  return (
    <DashboardFrame description="Today's cause list and your caseload.">
      <div className="mb-6">
        <MyAllocatedCases />
      </div>
      <PanelGrid>
        <EmptyPanel
          title="Today's cause list"
          icon={ClipboardList}
          emptyTitle="No cases listed today"
          emptyText="Cases fixed before you for today will appear here."
          actionLabel="Open cause list"
          actionTo="/judge/cause-lists"
        />
        <EmptyPanel
          title="Recent orders"
          icon={Gavel}
          emptyTitle="No orders recorded"
          emptyText="Orders and judgments you record will be shown here."
          actionLabel="Orders"
          actionTo="/judge/orders"
        />
      </PanelGrid>
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

export function ProcessServerPage() {
  return (
    <>
      <PageHeader
        title="Process Server"
        description="Summons are served through the DigitalAdaalat mobile app."
        crumbs={[{ label: 'Mobile app' }]}
      />
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Smartphone className="size-6" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Use the mobile app</h2>
            <p className="text-text-muted">
              Process servers (Tamila officers) work from the mobile app, not from this website. In
              the app you will see your pending summons, record your GPS location, take a delivery
              photo and capture the recipient's signature.
            </p>
            <p className="text-sm text-text-muted">The mobile app is planned for a later phase.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
