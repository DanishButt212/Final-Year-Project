import {
  CalendarDays,
  ClipboardList,
  Clock,
  FilePlus2,
  Gavel,
  MapPin,
  NotebookPen,
  Receipt,
  ScrollText,
  ShieldAlert,
  Shuffle,
  FileText,
  UserPlus,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { msg } from '@/i18n';
import type { Role } from './types';

export interface PaletteAction {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Role-specific quick actions offered by the command palette (labels are translation keys). */
export const PALETTE_ACTIONS: Record<Role, PaletteAction[]> = {
  LITIGANT: [
    { label: msg('File a new case'), path: '/litigant/new-case', icon: FilePlus2 },
    { label: msg('Pay court fee'), path: '/litigant/payments', icon: Receipt },
    { label: msg('Open cause list'), path: '/litigant/cause-lists', icon: ClipboardList },
    { label: msg('View hearing schedule'), path: '/litigant/hearings', icon: CalendarDays },
  ],
  LAWYER: [
    { label: msg('File a new case'), path: '/lawyer/new-case', icon: FilePlus2 },
    { label: msg('Register a new client'), path: '/lawyer/chamber/clients/new', icon: UserPlus },
    { label: msg('Record billable time'), path: '/lawyer/chamber/billable', icon: Clock },
    { label: msg('Pay court fee'), path: '/lawyer/payments', icon: Receipt },
    { label: msg('Open cause list'), path: '/lawyer/cause-lists', icon: ClipboardList },
  ],
  INTERN: [
    { label: msg('Record attendance'), path: '/intern/attendance', icon: MapPin },
    { label: msg('Write a research log'), path: '/intern/research-logs', icon: NotebookPen },
  ],
  PROCESS_SERVER: [
    { label: msg('Open my duty roster'), path: '/process-server', icon: ClipboardList },
  ],
  JUDGE: [
    { label: msg('Open my schedule'), path: '/judge/schedule', icon: CalendarDays },
    { label: msg('Open cause list'), path: '/judge/cause-lists', icon: ClipboardList },
    { label: msg('Record orders and decisions'), path: '/judge/orders', icon: Gavel },
  ],
  ADMIN: [
    { label: msg('Allocate cases'), path: '/admin/cases', icon: Shuffle },
    { label: msg('Schedule hearings'), path: '/admin/hearings', icon: CalendarClock },
    { label: msg('Issue summons'), path: '/admin/summons', icon: ScrollText },
    { label: msg('Generate report'), path: '/admin/reports', icon: FileText },
    { label: msg('Review security alerts'), path: '/admin/security', icon: ShieldAlert },
  ],
};
