import { api } from './api';
import type { Paginated } from './types';

// ---------------------------------------------------------------- chamber (lawyer)

export type RetainerStatus = 'OK' | 'LOW' | 'OVERDRAWN';

export interface ChamberProfile {
  id: string;
  chamberCode: string;
  name: string;
  officeAddress: string | null;
  partnerNames: string[];
  barMembershipIds: string[];
  practiceVerticals: string[];
  phone: string | null;
  email: string | null;
  licenseStatus: 'ACTIVE' | 'SUSPENDED';
  defaultHourlyRatePkr: string;
  lowBalanceThresholdPkr: string;
  lawyerName: string | null;
  barNumber: string | null;
}

export interface ProfileInput {
  name: string;
  officeAddress: string;
  partnerNames: string[];
  barMembershipIds: string[];
  practiceVerticals: string[];
  phone?: string;
  email?: string;
  defaultHourlyRatePkr: number;
  lowBalanceThresholdPkr: number;
}

export interface RetainerSummary {
  totalDeposits: string;
  totalDeductions: string;
  balance: string;
  status: RetainerStatus;
}

export interface ClientRow extends RetainerSummary {
  id: string;
  clientCode: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  caseType: string | null;
  onboardedOn: string;
}

export interface ClientDetail {
  id: string;
  clientCode: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  caseType: string | null;
  onboardedOn: string;
  retainer: RetainerSummary;
  invoiceTotal: string;
  linkedCases: { id: string; ucn: string; title: string }[];
  billable: {
    id: string;
    workedOn: string;
    hours: string;
    hourlyRate: string;
    amount: string;
    description: string | null;
    ucn: string | null;
  }[];
  transactions: {
    id: string;
    type: 'DEPOSIT' | 'DEDUCTION' | 'REFUND';
    amount: string;
    note: string | null;
    reference: string | null;
    createdAt: string;
  }[];
  alerts: { id: string; sentAt: string; balance: string }[];
}

export interface BillableRow {
  id: string;
  workedOn: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  hours: string;
  hourlyRate: string;
  amount: string;
  description: string | null;
  ucn: string | null;
}

export interface RetainerRow extends RetainerSummary {
  clientId: string;
  clientCode: string;
  name: string;
  lastAlertAt: string | null;
}

export interface ExpenseRow {
  id: string;
  spentOn: string;
  category: string;
  amount: string;
  note: string | null;
}

export interface Dashboard {
  chamber: { name: string; chamberCode: string };
  clients: number;
  billedThisMonth: string;
  hoursThisMonth: string;
  expensesThisMonth: string;
  retainerHeld: string;
  lowBalanceCount: number;
  lowBalanceClients: {
    id: string;
    clientCode: string;
    name: string;
    balance: string;
    status: RetainerStatus;
  }[];
  interns: number;
  pendingReviews: number;
  nextHearings: {
    id: string;
    date: string;
    startTime: string | null;
    courtroom: string | null;
    caseId: string;
    ucn: string;
    title: string;
  }[];
  weeklyBilled: { weekStart: string; amount: string }[];
}

export interface InternRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'DEACTIVATED';
  startDate: string;
  entries: number;
  pendingReviews: number;
  daysThisMonth: number;
  lastCheckInAt: string | null;
}

export type LogStatus = 'SUBMITTED' | 'APPROVED' | 'NEEDS_REVISION';

export interface ResearchLog {
  id: string;
  entryDate: string;
  caseId: string | null;
  ucn: string | null;
  caseTitle: string | null;
  keywords: string[];
  citation: string;
  notes: string;
  status: LogStatus;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  internId: string;
  internName: string;
}

export interface AttendanceRow {
  id: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  court: string | null;
  verified: boolean;
}

export interface InternDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: InternRow['status'];
  startDate: string;
  entries: number;
  attendance: AttendanceRow[];
  recentLogs: ResearchLog[];
}

export interface Msg {
  message: string;
}

export interface NewClientInput {
  name: string;
  cnic: string;
  phone: string;
  caseType: string;
  onboardedOn?: string;
}

export interface BillableInput {
  clientId: string;
  hours: number;
  notes: string;
  hourlyRate?: number;
  chargeAgainstRetainer: boolean;
  caseId?: string;
  workedOn?: string;
}

export interface InternInput {
  firstName: string;
  lastName: string;
  cnic: string;
  email: string;
  phone: string;
  startDate: string;
}

export const chamberApi = {
  profile: async () => (await api.get<ChamberProfile>('/chamber/profile')).data,
  saveProfile: async (v: ProfileInput) => (await api.put<Msg>('/chamber/profile', v)).data,
  dashboard: async () => (await api.get<Dashboard>('/chamber/dashboard')).data,
  cases: async () =>
    (await api.get<{ id: string; ucn: string; title: string }[]>('/chamber/cases')).data,
  clients: async (params: { page: number; limit: number; search?: string }) =>
    (await api.get<Paginated<ClientRow>>('/chamber/clients', { params })).data,
  clientOptions: async () =>
    (await api.get<{ id: string; clientCode: string; name: string }[]>('/chamber/client-options'))
      .data,
  createClient: async (v: NewClientInput) =>
    (
      await api.post<Msg & { client: { id: string; clientCode: string; name: string } }>(
        '/chamber/clients',
        v,
      )
    ).data,
  client: async (id: string) => (await api.get<ClientDetail>(`/chamber/clients/${id}`)).data,
  updateClient: async (id: string, v: Record<string, string | undefined>) =>
    (await api.patch<Msg>(`/chamber/clients/${id}`, v)).data,
  createBillable: async (v: BillableInput) => (await api.post<Msg>('/chamber/billable', v)).data,
  billable: async (params: {
    page: number;
    limit: number;
    clientId?: string;
    from?: string;
    to?: string;
  }) =>
    (
      await api.get<Paginated<BillableRow> & { totals: { hours: string; amount: string } }>(
        '/chamber/billable',
        { params },
      )
    ).data,
  retainerSummary: async () =>
    (
      await api.get<{
        thresholdPkr: string;
        data: RetainerRow[];
        totals: { deposits: string; deductions: string; balance: string };
      }>('/chamber/retainer-summary')
    ).data,
  deposit: async (clientId: string, v: { amount: number; reference?: string }) =>
    (await api.post<Msg>(`/chamber/clients/${clientId}/retainer/deposit`, v)).data,
  alert: async (clientId: string) =>
    (await api.post<Msg>(`/chamber/clients/${clientId}/low-balance-alert`)).data,
  expenses: async (params: { page: number; limit: number }) =>
    (
      await api.get<Paginated<ExpenseRow> & { totals: { all: string; thisMonth: string } }>(
        '/chamber/expenses',
        { params },
      )
    ).data,
  createExpense: async (v: { spentOn: string; category: string; amount: number; note?: string }) =>
    (await api.post<Msg>('/chamber/expenses', v)).data,
  interns: async () => (await api.get<InternRow[]>('/chamber/interns')).data,
  createIntern: async (v: InternInput) =>
    (
      await api.post<
        Msg & { intern: { id: string; name: string }; resetLink: string; expiresAt: string }
      >('/chamber/interns', v)
    ).data,
  intern: async (id: string) => (await api.get<InternDetail>(`/chamber/interns/${id}`)).data,
  internStatus: async (id: string, action: 'deactivate' | 'reactivate') =>
    (await api.patch<Msg>(`/chamber/interns/${id}/status`, { action })).data,
  logs: async (params: {
    page: number;
    limit: number;
    internId?: string;
    status?: LogStatus;
    q?: string;
  }) => (await api.get<Paginated<ResearchLog>>('/chamber/research-logs', { params })).data,
  review: async (id: string, v: { status: 'APPROVED' | 'NEEDS_REVISION'; comment?: string }) =>
    (await api.patch<Msg>(`/chamber/research-logs/${id}/review`, v)).data,
};

// ---------------------------------------------------------------- intern

export interface InternSummary {
  chamberName: string | null;
  daysThisMonth: number;
  entries: number;
  pendingReviews: number;
  approved: number;
  checkedInToday: boolean;
  recentReviews: ResearchLog[];
}

export interface AttendanceHistory {
  month: string;
  today: { checkInAt: string; checkOutAt: string | null; court: string | null } | null;
  maxAccuracyM: number;
  data: AttendanceRow[];
}

export interface LogInput {
  caseNumber: string;
  keywords: string[];
  citation: string;
  notes: string;
}

export const internApi = {
  summary: async () => (await api.get<InternSummary>('/intern/summary')).data,
  cases: async () =>
    (await api.get<{ id: string; ucn: string; title: string }[]>('/intern/cases')).data,
  logs: async (params: { page: number; limit: number }) =>
    (await api.get<Paginated<ResearchLog>>('/intern/research-logs', { params })).data,
  createLog: async (v: LogInput) => (await api.post<Msg>('/intern/research-logs', v)).data,
  updateLog: async (id: string, v: LogInput) =>
    (await api.patch<Msg>(`/intern/research-logs/${id}`, v)).data,
  attendance: async (month?: string) =>
    (await api.get<AttendanceHistory>('/intern/attendance', { params: { month } })).data,
  checkIn: async (v: GeoPoint) => (await api.post<Msg>('/intern/attendance/check-in', v)).data,
  checkOut: async (v: GeoPoint) => (await api.post<Msg>('/intern/attendance/check-out', v)).data,
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export const LOCATION_DENIED = 'Location access is required to log attendance.';

/** Asks the browser for the device location. Rejects with a user-facing message. */
export function getPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error(LOCATION_DENIED));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: Number(p.coords.latitude.toFixed(6)),
          longitude: Number(p.coords.longitude.toFixed(6)),
          accuracy: Math.round(p.coords.accuracy),
        }),
      () => reject(new Error(LOCATION_DENIED)),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

// ---------------------------------------------------------------- messages from the requirement document

export const MSG = {
  chamberDuplicate: 'Duplicate profile entry detected for this client ID.',
  incompleteLog: 'Incomplete log parameters. Please ensure citation fields are filled.',
};
