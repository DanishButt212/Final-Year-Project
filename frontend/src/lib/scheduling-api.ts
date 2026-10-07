import { api } from './api';
import type { Paginated } from './types';

export type HearingStatus = 'SCHEDULED' | 'HELD' | 'ADJOURNED' | 'CANCELLED';

export interface Conflict {
  type: 'JUDGE' | 'COURTROOM' | 'LAWYER';
  message: string;
  hearingId?: string;
  ucn?: string;
}

export interface Slot {
  slot: number;
  start: string;
  end: string;
}

export interface HearingView {
  id: string;
  caseId: string;
  ucn: string;
  title: string;
  date: string;
  weekday: string;
  slot: number;
  startTime: string | null;
  endTime: string | null;
  status: HearingStatus;
  purpose: string | null;
  courtroom: { id: string; name: string } | null;
  judge: { id: string; name: string };
  lawyers: string[];
  conflicts: Conflict[];
  isVirtual: boolean;
  virtualSession: { id: string; status: 'LOBBY_LOCKED' | 'ACTIVE' | 'ENDED' } | null;
}

export interface Board {
  court: { id: string; name: string };
  date: string;
  weekday: string;
  isWorkingDay: boolean;
  policy: { courtDayStart: string; courtDayEnd: string; hearingSlotMinutes: number };
  slots: Slot[];
  courtrooms: {
    id: string;
    name: string;
    benchNo: number | null;
    judges: { id: string; name: string; used: number; total: number }[];
    cells: { slot: number; hearing: HearingView | null }[];
  }[];
  hearingCount: number;
  conflictCount: number;
  causeList: { status: 'DRAFT' | 'PUBLISHED'; publishedAt: string | null } | null;
}

export interface Week {
  courtId: string;
  weekStart: string;
  courtrooms: { id: string; name: string }[];
  days: { date: string; counts: Record<string, number>; total: number; conflicts: number }[];
}

export interface CheckResult {
  valid: boolean;
  label?: string;
  message: string;
  conflicts: Conflict[];
}

export interface RunCheckResult {
  valid: boolean;
  message: string;
  conflicts: HearingView[] | [];
}

export interface AvailableDay {
  date: string;
  slots: (Slot & { courtrooms: { id: string; name: string }[] })[];
}

export interface SchedulableCase {
  id: string;
  ucn: string;
  title: string;
  caseType: string;
  judgeId: string | null;
  judge: string | null;
  hasUpcomingHearing: boolean;
}

export interface CauseListsResult {
  published: boolean;
  message?: string;
  date: string;
  courtrooms: { id: string; name: string }[];
  lists: {
    courtId: string;
    court: string;
    publishedAt: string | null;
    entries: {
      hearingId: string;
      isVirtual: boolean;
      serialNo: number;
      time: string | null;
      courtroom: string | null;
      courtroomId: string | null;
      judge: string;
      ucn: string;
      title: string;
      status: HearingStatus;
      isMine: boolean;
    }[];
  }[];
}

export interface HearingInput {
  caseId: string;
  courtroomId: string;
  judgeId?: string;
  date: string;
  slot: number;
  purpose?: string;
  isVirtual?: boolean;
}

export const schedulingApi = {
  async board(courtId: string, date: string) {
    return (await api.get<Board>('/admin/scheduling/board', { params: { courtId, date } })).data;
  },
  async week(courtId: string, weekStart: string) {
    return (await api.get<Week>('/admin/scheduling/week', { params: { courtId, weekStart } })).data;
  },
  async check(body: {
    caseId: string;
    courtroomId: string;
    judgeId?: string;
    date: string;
    slot: number;
    hearingId?: string;
  }) {
    return (await api.post<CheckResult>('/admin/scheduling/check', body)).data;
  },
  async runCheck(courtId: string, date: string) {
    return (await api.post<RunCheckResult>('/admin/scheduling/run-check', { courtId, date })).data;
  },
  async availableSlots(params: {
    caseId: string;
    from?: string;
    days?: number;
    excludeHearingId?: string;
  }) {
    return (
      await api.get<{ caseId: string; days: AvailableDay[] }>('/admin/scheduling/available-slots', {
        params,
      })
    ).data;
  },
  async schedulableCases(courtId: string, search?: string) {
    return (
      await api.get<SchedulableCase[]>('/admin/scheduling/schedulable-cases', {
        params: { courtId, search: search || undefined },
      })
    ).data;
  },
  async autoGenerate(body: { courtId: string; date: string; caseIds: string[] }) {
    return (
      await api.post<{
        message: string;
        placed: HearingView[];
        unplaced: { caseId: string; ucn: string | null; reason: string }[];
      }>('/admin/scheduling/auto-generate', body)
    ).data;
  },
  async create(body: HearingInput) {
    return (await api.post<{ message: string; hearing: HearingView }>('/admin/hearings', body))
      .data;
  },
  async reschedule(
    id: string,
    body: {
      date: string;
      slot: number;
      courtroomId?: string;
      judgeId?: string;
      resolveConflict?: boolean;
    },
  ) {
    return (
      await api.patch<{ message: string; hearing: HearingView }>(
        `/admin/hearings/${id}/reschedule`,
        body,
      )
    ).data;
  },
  async cancel(id: string, reason: string) {
    return (
      await api.post<{ message: string; hearing: HearingView }>(`/admin/hearings/${id}/cancel`, {
        reason,
      })
    ).data;
  },
  async publish(courtId: string, date: string) {
    return (await api.post<{ message: string }>('/admin/cause-lists/publish', { courtId, date }))
      .data;
  },

  async myHearings(params: { when: 'upcoming' | 'past'; page: number; limit: number }) {
    return (await api.get<Paginated<HearingView>>('/hearings/mine', { params })).data;
  },
  async judgeHearings(params: { from?: string; to?: string }) {
    return (
      await api.get<{ from: string; to: string; data: HearingView[] }>('/judge/hearings', {
        params,
      })
    ).data;
  },
  async causeLists(params: { date?: string; courtroomId?: string; courtId?: string }) {
    return (await api.get<CauseListsResult>('/cause-lists', { params })).data;
  },
};

// ---------------------------------------------------------------- date helpers (ISO dates, UTC)

export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const todayIso = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())).toISOString().slice(0, 10);
};

export const mondayIso = (iso: string) => {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDaysIso(iso, day === 0 ? -6 : 1 - day);
};

/** True when the date is today (local time) and the slot start time has already passed. */
export function slotPassed(iso: string, start: string, now: Date = new Date()): boolean {
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (iso !== local) return false;
  return (
    Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) <=
    now.getHours() * 60 + now.getMinutes()
  );
}

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const weekdayName = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const isoToDdMmYyyy = (iso: string) =>
  `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
export const isWeekend = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

/** Where a notification should lead for a given role. */
export function notificationLink(type: string, role: string): string | null {
  const portal = role.toLowerCase().replace('_', '-');
  if (type === 'CAUSE_LIST_PUBLISHED') return role === 'ADMIN' ? null : `/${portal}/cause-lists`;
  if (type === 'SUMMONS_ASSIGNED') return '/process-server';
  if (type === 'SECURITY_ALERT') return role === 'ADMIN' ? '/admin/security' : null;
  if (type === 'CASE_DECIDED') return role === 'ADMIN' ? '/admin/cases' : `/${portal}/cases`;
  if (type === 'SUMMONS_EXECUTED') return role === 'ADMIN' ? '/admin/summons' : `/${portal}/cases`;
  if (type === 'CHAMBER_LOW_BALANCE') return '/lawyer/chamber/retainer';
  if (type === 'RESEARCH_SUBMITTED') return '/lawyer/chamber/research-logs';
  if (type === 'RESEARCH_REVIEWED') return '/intern/research-logs';
  if (type === 'PAYMENT_RECEIVED') return role === 'ADMIN' ? null : `/${portal}/payments`;
  if (type === 'HEARING_ADJOURNED' && role === 'ADMIN') return '/admin/hearings';
  if (type.startsWith('HEARING_')) {
    if (role === 'JUDGE') return '/judge/schedule';
    return `/${portal}/hearings`;
  }
  return null;
}
