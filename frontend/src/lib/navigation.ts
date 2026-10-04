import {
  BarChart3,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FilePlus2,
  FileText,
  Gavel,
  Landmark,
  GraduationCap,
  History,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Bell,
  Receipt,
  Settings,
  UserCheck,
  Users,
  Wallet,
  Clock,
  Archive,
  Award,
  MapPin,
  Building2,
  UserPlus,
  NotebookPen,
  Shuffle,
  ScrollText,
  UserCircle,
} from 'lucide-react';
import type { Role } from './types';

export interface NavItem {
  /** URL segment under the portal, e.g. "my-cases". Empty string is the dashboard. */
  slug: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Items sharing a group are listed under that heading (lawyers: Chamber). */
  group?: string;
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
        label: 'Hearing Schedule',
        icon: CalendarDays,
        description: 'Upcoming hearing dates, rooms, timings and benches.',
      },
      {
        slug: 'cause-lists',
        label: 'Daily Cause Lists',
        icon: ClipboardList,
        description: 'The published court rosters for each day.',
      },
      {
        slug: 'payments',
        label: 'Payments & Receipts',
        icon: Receipt,
        description: 'Court fee payments and downloadable receipts.',
      },
      {
        slug: 'evidence',
        label: 'Evidence Vault',
        icon: Archive,
        description: 'Securely store and share case evidence.',
      },
      {
        slug: 'notifications',
        label: 'Notification Options',
        icon: Bell,
        description: 'Choose how you are notified.',
      },
      {
        slug: 'feedback',
        label: 'System Feedback',
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
      {
        slug: 'payments',
        label: 'Payments & Receipts',
        icon: Receipt,
        description: 'Court fee payments and downloadable receipts.',
      },
      {
        slug: 'hearings',
        label: 'Hearing Schedule',
        icon: CalendarDays,
        description: 'Your upcoming hearings, rooms, timings and benches.',
      },
      {
        slug: 'cause-lists',
        label: 'Daily Cause Lists',
        icon: ClipboardList,
        description: 'The published court rosters for each day.',
      },
      {
        slug: 'chamber',
        label: 'Chamber Dashboard',
        icon: LayoutDashboard,
        description: 'Clients, billing, retainers and interns at a glance.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/clients/new',
        label: 'Register New Client',
        icon: UserPlus,
        description: 'Register New Chamber Client Account.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/clients',
        label: 'Client Directory',
        icon: Users,
        description: 'Manage chamber clients.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/billable',
        label: 'Billable Hours',
        icon: Clock,
        description: 'Billable Hours Ledger Matrix.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/retainer',
        label: 'Retainer Accounts',
        icon: Wallet,
        description: 'Retainer Accounts & Trust Ledgers Summary.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/expenses',
        label: 'Expenses',
        icon: Receipt,
        description: 'Chamber expenses.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/interns',
        label: 'Interns',
        icon: GraduationCap,
        description: 'Intern accounts and attendance.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/research-logs',
        label: 'Research Log Review',
        icon: NotebookPen,
        description: 'Review intern research logs.',
        group: 'Chamber',
      },
      {
        slug: 'chamber/settings',
        label: 'Chamber Settings',
        icon: Building2,
        description: 'Chamber Settings & Identity Profile.',
        group: 'Chamber',
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
        slug: 'research-logs',
        label: 'Research Logs',
        icon: NotebookPen,
        description: 'Apprentice Diary / Research Logs.',
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
    label: 'Process Server Console',
    items: [
      {
        slug: '',
        label: 'My Duty Roster',
        icon: ClipboardList,
        description: 'Summons and notices assigned to you.',
      },
      {
        slug: 'profile',
        label: 'Staff Profile Settings',
        icon: UserCircle,
        description: 'Your precinct, sector, phone and photo.',
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
        slug: 'schedule',
        label: 'My Schedule',
        icon: CalendarDays,
        description: 'Your hearings for the week.',
      },
      {
        slug: 'cause-lists',
        label: 'Daily Cause Lists',
        icon: ClipboardList,
        description: 'The published court rosters for each day.',
      },
      {
        slug: 'cases',
        label: 'My Allocated Cases',
        icon: Briefcase,
        description: 'Cases allocated to you by the registrar.',
      },
      { slug: 'orders', label: 'Orders', icon: Gavel, description: 'Record orders and judgments.' },
    ],
  },
  ADMIN: {
    slug: 'admin',
    role: 'ADMIN',
    label: 'Administration',
    items: [
      {
        slug: '',
        label: 'Operations & Analytics',
        icon: BarChart3,
        description: 'Live metrics for the whole court system.',
      },
      {
        slug: 'accounts',
        label: 'Account Management',
        icon: Users,
        description: 'Registered litigant, lawyer and staff accounts.',
      },
      {
        slug: 'lawyer-verification',
        label: 'Lawyer Verification',
        icon: UserCheck,
        description: 'Verify Bar Council registrations.',
      },
      {
        slug: 'cases',
        label: 'Case Registry & Allocation',
        icon: Shuffle,
        description: 'All cases, and allocation to a court, bench and judge.',
      },
      {
        slug: 'courts',
        label: 'Courts & Benches',
        icon: Landmark,
        description: 'Courts, courtrooms and judges.',
      },
      {
        slug: 'summons',
        label: 'Summons & Notices',
        icon: ScrollText,
        description: 'Issue summons and notices and assign them to process servers.',
      },
      {
        slug: 'policies',
        label: 'System Policies',
        icon: Settings,
        description: 'Global variables and application constants.',
      },
      {
        slug: 'feedback',
        label: 'User Feedback',
        icon: MessageSquare,
        description: 'Feedback analysis and quality control.',
      },
      {
        slug: 'audit-logs',
        label: 'Audit Logs',
        icon: History,
        description: 'Immutable record of system activity.',
      },
      { slug: 'reports', label: 'Reports', icon: FileText, description: 'PDF and Excel reports.' },
      {
        slug: 'hearings',
        label: 'Bench Scheduling',
        icon: CalendarClock,
        description: 'Master board, anti-clash checks and cause lists.',
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
