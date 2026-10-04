import { api } from './api';
import { downloadBlob } from './phase4-api';
import type { Paginated } from './types';

export type SummonsStatus =
  'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'ATTEMPT_IN_PROGRESS' | 'EXECUTED' | 'CANCELLED';
export type Priority = 'URGENT' | 'NORMAL';
export type NoticeType = 'SUMMONS' | 'NOTICE';
export type ServiceMode = 'PERSONAL_DELIVERY' | 'REFUSED_AFFIXED';

export const STATUS_LABEL: Record<SummonsStatus, string> = {
  PENDING_ASSIGNMENT: 'Waiting for assignment',
  ASSIGNED: 'Assigned',
  ATTEMPT_IN_PROGRESS: 'Attempt in progress',
  EXECUTED: 'Executed',
  CANCELLED: 'Cancelled',
};

export const TELEMETRY_ERROR =
  'Telemetry Error: High-accuracy GPS coordinates required to commit log entries.';

export interface Msg {
  message: string;
}

export interface AdminSummons {
  id: string;
  caseId: string;
  ucn: string;
  caseTitle: string;
  court: string | null;
  noticeType: NoticeType;
  recipientName: string;
  serviceAddress: string;
  sector: string;
  priority: Priority;
  status: SummonsStatus;
  dueBy: string | null;
  overdue: boolean;
  issuedAt: string;
  executedAt: string | null;
  serviceMode: ServiceMode | null;
  attemptCount: number;
  server: { id: string; name: string; badgeNumber: string | null } | null;
}

export interface AdminSummonsDetail extends AdminSummons {
  recipientCnic: string | null;
  issuedBy: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  attempts: {
    id: string;
    createdAt: string;
    latitude: string;
    longitude: string;
    accuracyM: string;
    notes: string;
  }[];
  proof: {
    executedAt: string;
    serviceMode: ServiceMode;
    latitude: string | null;
    longitude: string | null;
    accuracyM: string | null;
    notes: string | null;
    hasPhoto: boolean;
    hasSignature: boolean;
    photoSha256: string | null;
    signatureSha256: string | null;
    sealedAt: string | null;
    seal: string | null;
  } | null;
}

export interface ProcessServerOption {
  id: string;
  name: string;
  badgeNumber: string;
  sector: string;
  court: string;
  courtId: string;
  openWorkload: number;
}

export interface IssueInput {
  caseId: string;
  noticeType: NoticeType;
  recipientName: string;
  recipientCnic?: string;
  serviceAddress: string;
  sector: string;
  priority: Priority;
  dueDate?: string;
  assignedServerId?: string;
  partyId?: string;
}

export const adminSummonsApi = {
  list: async (params: {
    page: number;
    limit: number;
    status?: string;
    serverId?: string;
    courtId?: string;
    sector?: string;
    overdue?: boolean;
    search?: string;
  }) => (await api.get<Paginated<AdminSummons>>('/admin/summons', { params })).data,
  detail: async (id: string) => (await api.get<AdminSummonsDetail>(`/admin/summons/${id}`)).data,
  issue: async (v: IssueInput) => (await api.post<Msg & { id: string }>('/admin/summons', v)).data,
  assign: async (id: string, serverId: string) =>
    (await api.patch<Msg>(`/admin/summons/${id}/assign`, { serverId })).data,
  cancel: async (id: string, reason: string) =>
    (await api.post<Msg>(`/admin/summons/${id}/cancel`, { reason })).data,
  verify: async (id: string) =>
    (
      await api.post<{ result: 'valid' | 'tampered'; message: string; sealedAt: string }>(
        `/admin/summons/${id}/verify-seal`,
      )
    ).data,
  servers: async (params?: { courtId?: string; sector?: string }) =>
    (await api.get<ProcessServerOption[]>('/admin/process-servers', { params })).data,
  caseParties: async (caseId: string) =>
    (
      await api.get<{
        id: string;
        ucn: string;
        title: string;
        allocated: boolean;
        parties: {
          id: string;
          name: string;
          role: string;
          address: string | null;
          cnic: string | null;
        }[];
      }>(`/admin/cases/${caseId}/summons-parties`)
    ).data,
  /** Fetches a proof image as an object URL for an <img>. The caller revokes it. */
  async proofImage(id: string, kind: 'photo' | 'signature') {
    const res = await api.get<Blob>(`/admin/summons/${id}/proof/${kind}`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  },
};

// ---------------------------------------------------------------- case side

export interface CaseSummons {
  id: string;
  noticeType: NoticeType;
  recipientName: string;
  status: SummonsStatus;
  dueBy: string | null;
  overdue: boolean;
  attemptCount: number;
  lastAttemptAt: string | null;
  executedAt: string | null;
  serviceMode: ServiceMode | null;
  hasProof: boolean;
  attempts: { id: string; createdAt: string; notes: string }[];
  serviceAddress?: string;
  server?: { name: string; badgeNumber: string | null } | null;
  proof?: {
    latitude: string | null;
    longitude: string | null;
    accuracyM: string | null;
    notes: string | null;
    hasPhoto: boolean;
    hasSignature: boolean;
    seal: string | null;
  } | null;
}

export const caseSummonsApi = {
  list: async (caseId: string) => (await api.get<CaseSummons[]>(`/cases/${caseId}/summons`)).data,
  downloadProof: (id: string, ucn: string) =>
    downloadBlob(`/summons/${id}/proof.pdf`, `proof-of-service-${ucn}.pdf`),
  async proofImage(id: string, kind: 'photo' | 'signature') {
    const res = await api.get<Blob>(`/summons/${id}/proof/${kind}`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  },
};

// ---------------------------------------------------------------- process server console

export interface ServerSummons {
  id: string;
  caseId: string;
  ucn: string;
  caseTitle: string;
  noticeType: NoticeType;
  recipientName: string;
  serviceAddress: string;
  sector: string;
  priority: Priority;
  status: SummonsStatus;
  dueBy: string | null;
  overdue: boolean;
  executedAt: string | null;
  serviceMode: ServiceMode | null;
  attemptCount: number;
  attempts: { id: string; createdAt: string; accuracyM: string; notes: string }[];
}

export interface ServerProfile {
  name: string;
  email: string;
  badgeNumber: string;
  badgeStatus: 'ACTIVE' | 'SUSPENDED';
  precinct: string;
  sector: string;
  phone: string;
  hasPhoto: boolean;
}

export interface Telemetry {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export const serverApi = {
  roster: async () =>
    (await api.get<{ data: ServerSummons[]; message?: string }>('/server/roster')).data,
  summary: async () =>
    (
      await api.get<{
        open: number;
        executedThisWeek: number;
        overdue: number;
        maxGpsAccuracyM: number;
      }>('/server/summary')
    ).data,
  detail: async (id: string) => (await api.get<ServerSummons>(`/server/summons/${id}`)).data,
  attempt: async (id: string, v: Telemetry & { notes: string }) =>
    (await api.post<Msg>(`/server/summons/${id}/attempts`, v)).data,
  finalize: async (
    id: string,
    v: Telemetry & {
      notes: string;
      serviceMode: ServiceMode;
      photo: Blob;
      signature?: Blob | null;
    },
  ) => {
    const form = new FormData();
    form.append('latitude', String(v.latitude));
    form.append('longitude', String(v.longitude));
    form.append('accuracyM', String(v.accuracyM));
    form.append('notes', v.notes);
    form.append('serviceMode', v.serviceMode);
    form.append('photo', v.photo, 'photo.jpg');
    if (v.signature) form.append('signature', v.signature, 'signature.png');
    return (
      await api.post<Msg>(`/server/summons/${id}/finalize`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  profile: async () => (await api.get<ServerProfile>('/server/profile')).data,
  updateProfile: async (v: { phone?: string; photo?: File | null }) => {
    const form = new FormData();
    if (v.phone) form.append('phone', v.phone);
    if (v.photo) form.append('photo', v.photo);
    return (
      await api.patch<Msg & { profile: ServerProfile }>('/server/profile', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  async profilePhoto() {
    const res = await api.get<Blob>('/server/profile/photo', { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  },
};

/** Google Maps search link built from the address only (no API key, no tracking of the server). */
export const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** High-accuracy browser location with a 15 second timeout. Rejects with the telemetry error. */
export function highAccuracyPosition(): Promise<Telemetry> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error(TELEMETRY_ERROR));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: Number(p.coords.latitude.toFixed(6)),
          longitude: Number(p.coords.longitude.toFixed(6)),
          accuracyM: Math.round(p.coords.accuracy * 100) / 100,
        }),
      () => reject(new Error(TELEMETRY_ERROR)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
