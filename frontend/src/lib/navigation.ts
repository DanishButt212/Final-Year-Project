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
  Video,
  ShieldAlert,
  UserCircle,
} from 'lucide-react';
import type { Role } from './types';

import { msg } from '@/i18n';

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
  label: msg('Dashboard'),
  icon: LayoutDashboard,
  description,
});

export const PORTALS: Record<Role, Portal> = {
  LITIGANT: {
    slug: 'litigant',
    role: 'LITIGANT',
    label: msg('Litigant Portal'),
    items: [
      dash(msg('Your cases, hearings and payments at a glance.')),
      {
        slug: 'new-case',
        label: msg('New Case Submission'),
        icon: FilePlus2,
        description: msg('Multi-step electronic filing with PDF pleadings.'),
      },
      {
        slug: 'cases',
        label: msg('My Case Portfolio'),
        icon: Briefcase,
        description: msg('Track every case you filed, with its judge bench and full history.'),
      },
      {
        slug: 'hearings',
        label: msg('Hearing Schedule'),
        icon: CalendarDays,
        description: msg('Upcoming hearing dates, rooms, timings and benches.'),
      },
      {
        slug: 'cause-lists',
        label: msg('Daily Cause Lists'),
        icon: ClipboardList,
        description: msg('The published court rosters for each day.'),
      },
      {
        slug: 'payments',
        label: msg('Payments & Receipts'),
        icon: Receipt,
        description: msg('Court fee payments and downloadable receipts.'),
      },
      {
        slug: 'evidence',
        label: msg('Evidence Vault'),
        icon: Archive,
        description: msg('Securely store and share case evidence.'),
      },
      {
        slug: 'notifications',
        label: msg('Notification Options'),
        icon: Bell,
        description: msg('Choose how you are notified.'),
      },
      {
        slug: 'feedback',
        label: msg('System Feedback'),
        icon: MessageSquare,
        description: msg('Tell us how the service can improve.'),
      },
    ],
  },
  LAWYER: {
    slug: 'lawyer',
    role: 'LAWYER',
    label: msg('Lawyer Chamber'),
    items: [
      dash(msg('Your chamber, clients and cases at a glance.')),
      {
        slug: 'new-case',
        label: msg('New Case Submission'),
        icon: FilePlus2,
        description: msg('Electronic filing for your clients.'),
      },
      {
        slug: 'cases',
        label: msg('My Case Portfolio'),
        icon: Briefcase,
        description: msg('Cases you filed or appear in, with their judge bench and full history.'),
      },
      {
        slug: 'payments',
        label: msg('Payments & Receipts'),
        icon: Receipt,
        description: msg('Court fee payments and downloadable receipts.'),
      },
      {
        slug: 'hearings',
        label: msg('Hearing Schedule'),
        icon: CalendarDays,
        description: msg('Your upcoming hearings, rooms, timings and benches.'),
      },
      {
        slug: 'cause-lists',
        label: msg('Daily Cause Lists'),
        icon: ClipboardList,
        description: msg('The published court rosters for each day.'),
      },
      {
        slug: 'chamber',
        label: msg('Chamber Dashboard'),
        icon: LayoutDashboard,
        description: msg('Clients, billing, retainers and interns at a glance.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/clients/new',
        label: msg('Register New Client'),
        icon: UserPlus,
        description: msg('Register New Chamber Client Account.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/clients',
        label: msg('Client Directory'),
        icon: Users,
        description: msg('Manage chamber clients.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/billable',
        label: msg('Billable Hours'),
        icon: Clock,
        description: msg('Billable Hours Ledger Matrix.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/retainer',
        label: msg('Retainer Accounts'),
        icon: Wallet,
        description: msg('Retainer Accounts & Trust Ledgers Summary.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/expenses',
        label: msg('Expenses'),
        icon: Receipt,
        description: msg('Chamber expenses.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/interns',
        label: msg('Interns'),
        icon: GraduationCap,
        description: msg('Intern accounts and attendance.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/research-logs',
        label: msg('Research Log Review'),
        icon: NotebookPen,
        description: msg('Review intern research logs.'),
        group: msg('Chamber'),
      },
      {
        slug: 'chamber/settings',
        label: msg('Chamber Settings'),
        icon: Building2,
        description: msg('Chamber Settings & Identity Profile.'),
        group: msg('Chamber'),
      },
    ],
  },
  INTERN: {
    slug: 'intern',
    role: 'INTERN',
    label: msg('Legal Intern Portal'),
    items: [
      dash(msg('Your diary, attendance and progress.')),
      {
        slug: 'research-logs',
        label: msg('Research Logs'),
        icon: NotebookPen,
        description: msg('Apprentice Diary / Research Logs.'),
      },
      {
        slug: 'attendance',
        label: msg('Attendance'),
        icon: MapPin,
        description: msg('Geo-fenced check-in and check-out.'),
      },
      {
        slug: 'certificate',
        label: msg('Certificate'),
        icon: Award,
        description: msg('Download your completion certificate.'),
      },
    ],
  },
  PROCESS_SERVER: {
    slug: 'process-server',
    role: 'PROCESS_SERVER',
    label: msg('Process Server Console'),
    items: [
      {
        slug: '',
        label: msg('My Duty Roster'),
        icon: ClipboardList,
        description: msg('Summons and notices assigned to you.'),
      },
      {
        slug: 'profile',
        label: msg('Staff Profile Settings'),
        icon: UserCircle,
        description: msg('Your precinct, sector, phone and photo.'),
      },
    ],
  },
  JUDGE: {
    slug: 'judge',
    role: 'JUDGE',
    label: msg('Judge Portal'),
    items: [
      dash(msg('Today’s cause list and your caseload.')),
      {
        slug: 'schedule',
        label: msg('My Schedule'),
        icon: CalendarDays,
        description: msg('Your hearings for the week.'),
      },
      {
        slug: 'cause-lists',
        label: msg('Daily Cause Lists'),
        icon: ClipboardList,
        description: msg('The published court rosters for each day.'),
      },
      {
        slug: 'cases',
        label: msg('My Allocated Cases'),
        icon: Briefcase,
        description: msg('Cases allocated to you by the registrar.'),
      },
      {
        slug: 'orders',
        label: msg('Orders'),
        icon: Gavel,
        description: msg('Hearing orders and decisions you have recorded.'),
      },
    ],
  },
  ADMIN: {
    slug: 'admin',
    role: 'ADMIN',
    label: msg('Administration'),
    items: [
      {
        slug: '',
        label: msg('Operations & Analytics'),
        icon: BarChart3,
        description: msg('Live metrics for the whole court system.'),
      },
      {
        slug: 'accounts',
        label: msg('Account Management'),
        icon: Users,
        description: msg('Registered litigant, lawyer and staff accounts.'),
      },
      {
        slug: 'lawyer-verification',
        label: msg('Lawyer Verification'),
        icon: UserCheck,
        description: msg('Verify Bar Council registrations.'),
      },
      {
        slug: 'cases',
        label: msg('Case Registry & Allocation'),
        icon: Shuffle,
        description: msg('All cases, and allocation to a court, bench and judge.'),
      },
      {
        slug: 'courts',
        label: msg('Courts & Benches'),
        icon: Landmark,
        description: msg('Courts, courtrooms and judges.'),
      },
      {
        slug: 'summons',
        label: msg('Summons & Notices'),
        icon: ScrollText,
        description: msg('Issue summons and notices and assign them to process servers.'),
      },
      {
        slug: 'policies',
        label: msg('System Policies'),
        icon: Settings,
        description: msg('Global variables and application constants.'),
      },
      {
        slug: 'feedback',
        label: msg('User Feedback'),
        icon: MessageSquare,
        description: msg('Feedback analysis and quality control.'),
      },
      {
        slug: 'audit-logs',
        label: msg('Audit Logs'),
        icon: History,
        description: msg('Immutable record of system activity.'),
      },
      {
        slug: 'security',
        label: msg('Security Alerts'),
        icon: ShieldAlert,
        description: 'Privilege escalation threats and blocked hosts.',
      },
      {
        slug: 'reports',
        label: msg('Reports'),
        icon: FileText,
        description: msg('Judicial performance statistics with PDF and Excel export.'),
      },
      {
        slug: 'hearings',
        label: msg('Bench Scheduling'),
        icon: CalendarClock,
        description: msg('Master board, anti-clash checks and cause lists.'),
      },
      {
        slug: 'virtual-courtroom',
        label: msg('Virtual Courtroom Control'),
        icon: Video,
        description: msg('Live virtual hearing sessions and room participants.'),
      },
    ],
  },
};

export const PORTAL_BY_SLUG: Record<string, Portal> = Object.fromEntries(
  Object.values(PORTALS).map((p) => [p.slug, p]),
);

export const ROLE_LABEL: Record<Role, string> = {
  LITIGANT: msg('Litigant'),
  LAWYER: msg('Lawyer'),
  INTERN: msg('Legal Intern'),
  PROCESS_SERVER: msg('Process Server'),
  JUDGE: msg('Judge'),
  ADMIN: msg('Administrator'),
};

export const roleHome = (role: Role) => `/${PORTALS[role].slug}`;

export const portalPath = (portal: Portal, slug: string) =>
  slug ? `/${portal.slug}/${slug}` : `/${portal.slug}`;
