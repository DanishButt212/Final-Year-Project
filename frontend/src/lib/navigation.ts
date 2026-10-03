import {
  BarChart3,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  Gavel,
  GraduationCap,
  History,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Bell,
  Receipt,
  Settings,
  Smartphone,
  UserCheck,
  Users,
  Video,
  Wallet,
  Clock,
  Archive,
  Award,
  MapPin,
  NotebookPen,
  Shuffle,
} from 'lucide-react';
import type { Role } from './types';

export interface NavItem {
  /** URL segment under the portal, e.g. "my-cases". Empty string is the dashboard. */
  slug: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface Portal {
  slug: string;
  role: Role;
  label: string;
  items: NavItem[];
}

const dash = (description: string): NavItem => ({
  slug: '',
  label: 'Dashboard',
  icon: LayoutDashboard,
  description,
});

export const PORTALS: Record<Role, Portal> = {
  LITIGANT: {
    slug: 'litigant',
    role: 'LITIGANT',
    label: 'Litigant Portal',
    items: [
      dash('Your cases, hearings and payments at a glance.'),
      {
        slug: 'new-case',
        label: 'New Case Submission',
        icon: FilePlus2,
        description: 'Multi-step electronic filing with PDF pleadings.',
      },
      {
        slug: 'cases',
        label: 'My Case Portfolio',
        icon: Briefcase,
        description: 'Track every case you filed, with its judge bench and full history.',
      },
      {
        slug: 'hearings',
        label: 'Hearings & Cause List',
        icon: CalendarDays,
        description: 'Upcoming hearings and the daily cause list.',
      },
      {
        slug: 'payments',
        label: 'Challans & Payments',
        icon: Receipt,
        description: 'Court fee challans, online payment and receipts.',
      },
      {
        slug: 'evidence',
        label: 'Evidence Vault',
        icon: Archive,
        description: 'Securely store and share case evidence.',
      },
      {
        slug: 'notifications',
        label: 'Notification Settings',
        icon: Bell,
        description: 'Choose how you are notified.',
      },
      {
        slug: 'feedback',
        label: 'Feedback',
        icon: MessageSquare,
        description: 'Tell us how the service can improve.',
      },
    ],
  },
  LAWYER: {
    slug: 'lawyer',
    role: 'LAWYER',
    label: 'Lawyer Chamber',
    items: [
      dash('Your chamber, clients and cases at a glance.'),
      {
        slug: 'new-case',
        label: 'New Case Submission',
        icon: FilePlus2,
        description: 'Electronic filing for your clients.',
      },
      {
        slug: 'cases',
        label: 'My Case Portfolio',
        icon: Briefcase,
        description: 'Cases you filed or appear in, with their judge bench and full history.',
      },
      { slug: 'clients', label: 'Clients', icon: Users, description: 'Manage chamber clients.' },
      {
        slug: 'billable-hours',
        label: 'Billable Hours',
        icon: Clock,
        description: 'Record and review billable time.',
      },
      {
        slug: 'retainer',
        label: 'Retainer & Expenses',
        icon: Wallet,
        description: 'Retainer balances and chamber expenses.',
      },
      {
        slug: 'interns',
        label: 'Interns',
        icon: GraduationCap,
        description: 'Review intern diaries and attendance.',
      },
      {
        slug: 'hearings',
        label: 'Hearings & Cause List',
        icon: CalendarDays,
        description: 'Your hearing calendar and daily cause list.',
      },
    ],
  },
  INTERN: {
    slug: 'intern',
    role: 'INTERN',
    label: 'Legal Intern Portal',
    items: [
      dash('Your diary, attendance and progress.'),
      {
        slug: 'diary',
        label: 'Daily Diary',
        icon: NotebookPen,
        description: 'Record what you learned each day.',
      },
      {
        slug: 'attendance',
        label: 'Attendance',
        icon: MapPin,
        description: 'Geo-fenced check-in and check-out.',
      },
      {
        slug: 'certificate',
        label: 'Certificate',
        icon: Award,
        description: 'Download your completion certificate.',
      },
    ],
  },
  PROCESS_SERVER: {
    slug: 'process-server',
    role: 'PROCESS_SERVER',
    label: 'Process Server',
    items: [
      {
        slug: '',
        label: 'Mobile App',
        icon: Smartphone,
        description: 'Summons are served through the mobile app.',
      },
    ],
  },
  JUDGE: {
    slug: 'judge',
    role: 'JUDGE',
    label: 'Judge Portal',
    items: [
      dash('Today’s cause list and your caseload.'),
      {
        slug: 'cause-list',
        label: 'Cause List',
        icon: ClipboardList,
        description: 'Cases listed before you.',
      },
      {
        slug: 'cases',
        label: 'Case Status',
        icon: Briefcase,
        description: 'Status of cases allocated to you.',
      },
      { slug: 'orders', label: 'Orders', icon: Gavel, description: 'Record orders and judgments.' },
    ],
  },
  ADMIN: {
    slug: 'admin',
    role: 'ADMIN',
    label: 'Administration',
    items: [
      dash('System overview and user management.'),
      {
        slug: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        description: 'Filing, disposal and workload charts.',
      },
      {
        slug: 'lawyer-verification',
        label: 'Lawyer Verification',
        icon: UserCheck,
        description: 'Verify Bar Council registrations.',
      },
      {
        slug: 'allocation',
        label: 'Case Allocation',
        icon: Shuffle,
        description: 'Random judge allocation.',
      },
      {
        slug: 'cause-list-builder',
        label: 'Cause List Builder',
        icon: ClipboardCheck,
        description: 'Build and publish daily cause lists.',
      },
      {
        slug: 'scheduling',
        label: 'Anti-clash Scheduling',
        icon: CalendarClock,
        description: 'Hearing scheduling without double-booking.',
      },
      {
        slug: 'virtual-courtroom',
        label: 'Virtual Courtroom',
        icon: Video,
        description: 'Control online hearings.',
      },
      {
        slug: 'audit-logs',
        label: 'Audit Logs',
        icon: History,
        description: 'Immutable record of system activity.',
      },
      { slug: 'reports', label: 'Reports', icon: FileText, description: 'PDF and Excel reports.' },
      {
        slug: 'settings',
        label: 'System Settings',
        icon: Settings,
        description: 'Fees, geofence and other settings.',
      },
    ],
  },
};

export const PORTAL_BY_SLUG: Record<string, Portal> = Object.fromEntries(
  Object.values(PORTALS).map((p) => [p.slug, p]),
);

export const ROLE_LABEL: Record<Role, string> = {
  LITIGANT: 'Litigant',
  LAWYER: 'Lawyer',
  INTERN: 'Legal Intern',
  PROCESS_SERVER: 'Process Server',
  JUDGE: 'Judge',
  ADMIN: 'Administrator',
};

export const roleHome = (role: Role) => `/${PORTALS[role].slug}`;

export const portalPath = (portal: Portal, slug: string) =>
  slug ? `/${portal.slug}/${slug}` : `/${portal.slug}`;
