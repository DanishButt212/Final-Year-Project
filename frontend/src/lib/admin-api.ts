import { api } from './api';
import type { CaseDetail } from './cases-api';
import type { CaseStatus, CaseType } from './case-status';
import type { Paginated, Role, UserStatus, VerificationStatus } from './types';

// ---------------------------------------------------------------- settings

export interface PublicSettings {
  maxAttachmentMb: number;
  caseRegistrationOpen: boolean;
}

export interface FeeRow {
  id: string;
  caseType: CaseType;
  description: string;
  amount: string;
}

export interface Settings extends PublicSettings {
  filingFeeRateModifier: string;
  courtDayStart: string;
  courtDayEnd: string;
  hearingSlotMinutes: number;
  adValoremPercent: string;
  adValoremCapPkr: string;
  challanDueDays: number;
  maxEvidenceMb: number;
  attendanceDefaultRadiusM: number;
  attendanceMaxAccuracyM: number;
  fees: FeeRow[];
}

export interface UpdateSettingsPayload {
  maxAttachmentMb?: number;
  caseRegistrationOpen?: boolean;
  filingFeeRateModifier?: string;
  courtDayStart?: string;
  courtDayEnd?: string;
  hearingSlotMinutes?: number;
  adValoremPercent?: string;
  adValoremCapPkr?: string;
  challanDueDays?: number;
  maxEvidenceMb?: number;
  attendanceDefaultRadiusM?: number;
  attendanceMaxAccuracyM?: number;
  fees?: { caseType: CaseType; amount: string }[];
}

export const settingsApi = {
  async publicSettings() {
    return (await api.get<PublicSettings>('/settings/public')).data;
  },
  async get() {
    return (await api.get<Settings>('/admin/settings')).data;
  },
  async update(payload: UpdateSettingsPayload) {
    return (await api.put<{ message: string; settings: Settings }>('/admin/settings', payload))
      .data;
  },
};

// ---------------------------------------------------------------- notifications

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  async list(params: { page?: number; limit?: number } = {}) {
    return (
      await api.get<Paginated<AppNotification> & { unreadCount: number }>('/notifications', {
        params,
      })
    ).data;
  },
  async markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
  },
  async readAll() {
    await api.post('/notifications/read-all');
  },
};

// ---------------------------------------------------------------- dashboard

export interface DayCount {
  date: string;
  count: number;
}

export interface DashboardStats {
  courtId: string | null;
  courts: { id: string; name: string }[];
  cases: {
    total: number;
    byStatus: Record<CaseStatus, number>;
    pendingAssignment: number;
    active: number;
    filedPerDay: DayCount[];
    decidedPerDay: DayCount[];
  };
  pendingAssignmentList: {
    id: string;
    ucn: string;
    title: string;
    caseType: CaseType;
    filingDate: string | null;
  }[];
  pendingLawyerApprovals: number;
  documents: { total: number; attachedLast7Days: number };
  users: { total: number; byRole: Partial<Record<Role, number>> };
  health: {
    uptimeSeconds: number;
    database: 'up' | 'down';
    databaseLatencyMs: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; systemUsedPercent: number };
  };
}

// ---------------------------------------------------------------- users

export interface AdminUser {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  cnic: string;
  phone: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  court: { id: string; name: string } | null;
  courtroom: { id: string; name: string } | null;
  lawyerProfile: { barNumber: string | null; verificationStatus: VerificationStatus } | null;
}

export type StatusAction = 'suspend' | 'block' | 'reactivate' | 'delete';

export interface CreateStaffPayload {
  role: 'INTERN' | 'PROCESS_SERVER' | 'JUDGE' | 'ADMIN';
  firstName: string;
  lastName: string;
  cnic: string;
  email: string;
  phone: string;
  courtId?: string;
  courtroomId?: string;
  supervisorLawyerId?: string;
}

// ---------------------------------------------------------------- lawyers

export interface LawyerItem {
  id: string;
  barNumber: string | null;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  registeredAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    cnic: string;
    phone: string;
    status: UserStatus;
  };
}

export interface BarCheckResult {
  barNumber: string | null;
  found: boolean;
  reason: string;
  checkedAt: string;
}

// ---------------------------------------------------------------- courts and cases

export interface CourtRow {
  id: string;
  name: string;
  type: string;
  city: string;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number | null;
  courtrooms: { id: string; name: string; benchNo: number | null; isActive: boolean }[];
  judges: {
    id: string;
    name: string;
    status: UserStatus;
    courtroomId: string | null;
    activeCases: number;
  }[];
}

export interface AdminCaseItem {
  id: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  filingDate: string | null;
  court: string | null;
  courtId: string | null;
  courtroom: string | null;
  judge: string | null;
  filedBy: string;
  feeStatus: 'PAID' | 'UNPAID' | 'NOT_GENERATED';
}

export interface AdminCaseQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CaseStatus;
  courtId?: string;
  caseType?: CaseType;
  from?: string;
  to?: string;
}

export interface AllocatePayload {
  mode: 'MANUAL' | 'RANDOM';
  courtId: string;
  courtroomId?: string;
  judgeId?: string;
  reallocate?: boolean;
}

export interface AllocateResult {
  message: string;
  judge: { id: string; name: string };
  court: string;
  courtroom: string | null;
  previousJudge: string | null;
  mode: 'MANUAL' | 'RANDOM';
}

export interface JudgeCaseItem {
  id: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  filingDate: string | null;
  courtroom: string | null;
  filedBy: string;
}

export const adminApi = {
  async stats(courtId?: string) {
    return (
      await api.get<DashboardStats>('/admin/dashboard/stats', {
        params: courtId ? { courtId } : undefined,
      })
    ).data;
  },

  async users(params: {
    page: number;
    limit: number;
    search?: string;
    role?: Role;
    status?: UserStatus;
  }) {
    return (await api.get<Paginated<AdminUser>>('/admin/users', { params })).data;
  },
  async createStaff(payload: CreateStaffPayload) {
    return (
      await api.post<{ message: string; user: AdminUser; resetLink: string; expiresAt: string }>(
        '/admin/users',
        payload,
      )
    ).data;
  },
  async changeStatus(id: string, action: StatusAction) {
    return (
      await api.patch<{ message: string; user: AdminUser }>(`/admin/users/${id}/status`, {
        action,
      })
    ).data;
  },

  async lawyers(params: {
    status: VerificationStatus;
    page: number;
    limit: number;
    search?: string;
  }) {
    return (
      await api.get<Paginated<LawyerItem> & { counts: Record<VerificationStatus, number> }>(
        '/admin/lawyers',
        { params },
      )
    ).data;
  },
  async barCheck(id: string) {
    return (await api.post<BarCheckResult>(`/admin/lawyers/${id}/bar-check`)).data;
  },
  async verifyLawyer(id: string) {
    return (await api.post<{ message: string; lawyer: LawyerItem }>(`/admin/lawyers/${id}/verify`))
      .data;
  },
  async rejectLawyer(id: string, reason: string) {
    return (
      await api.post<{ message: string; lawyer: LawyerItem }>(`/admin/lawyers/${id}/reject`, {
        reason,
      })
    ).data;
  },

  async courts() {
    return (await api.get<CourtRow[]>('/admin/courts')).data;
  },
  async updateGeofence(
    id: string,
    payload: { latitude: number | null; longitude: number | null; geofenceRadiusM: number | null },
  ) {
    return (await api.patch<{ message: string }>(`/admin/courts/${id}`, payload)).data;
  },
  async createCourtroom(payload: { name: string; benchNo?: number; courtId: string }) {
    return (await api.post<{ message: string }>('/admin/courtrooms', payload)).data;
  },
  async updateCourtroom(
    id: string,
    payload: { name?: string; benchNo?: number; isActive?: boolean },
  ) {
    return (await api.patch<{ message: string }>(`/admin/courtrooms/${id}`, payload)).data;
  },

  async cases(params: AdminCaseQuery) {
    return (await api.get<Paginated<AdminCaseItem>>('/admin/cases', { params })).data;
  },
  async caseDetail(id: string) {
    return (await api.get<CaseDetail>(`/admin/cases/${id}`)).data;
  },
  async allocate(id: string, payload: AllocatePayload) {
    return (await api.post<AllocateResult>(`/admin/cases/${id}/allocate`, payload)).data;
  },
  async downloadDocument(caseId: string, doc: { id: string; name: string }) {
    const res = await api.get<Blob>(`/admin/cases/${caseId}/documents/${doc.id}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async judgeCases(params: { page: number; limit: number; search?: string }) {
    return (await api.get<Paginated<JudgeCaseItem>>('/judge/cases', { params })).data;
  },
};
