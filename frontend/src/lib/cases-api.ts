import { api } from './api';
import type { CaseStatus, CaseType } from './case-status';
import type { Paginated } from './types';

export interface CaseListItem {
  id: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  filingDate: string | null;
  createdAt: string;
  court: string | null;
  courtroom: string | null;
  judge: string | null;
}

export interface CaseSummary {
  total: number;
  pendingAssignment: number;
  recent: CaseListItem[];
}

export interface CaseParty {
  id: string;
  role: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  address: string | null;
  hasCounsel: boolean;
}

export interface CaseDocument {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CaseEvent {
  id: string;
  type: 'CASE_SUBMITTED' | 'DOCUMENT_ATTACHED';
  description: string;
  createdAt: string;
  actor: string | null;
}

export interface CaseDetail {
  id: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  reliefSought: string;
  filingDate: string | null;
  createdAt: string;
  filedBy: string;
  court: { id: string; name: string; city: string } | null;
  courtroom: { id: string; name: string } | null;
  judge: string | null;
  parties: CaseParty[];
  documents: CaseDocument[];
  events: CaseEvent[];
}

export interface CreateCasePayload {
  caseType: CaseType;
  title?: string;
  reliefSought: string;
  petitioners: PartyPayload[];
  respondents: PartyPayload[];
}
export interface PartyPayload {
  name: string;
  cnic?: string;
  address?: string;
  phone?: string;
}

export type ProgressHandler = (percent: number) => void;

const multipart = (onProgress?: ProgressHandler) => ({
  // Let the browser set the multipart boundary.
  headers: { 'Content-Type': undefined },
  onUploadProgress: (e: { loaded: number; total?: number }) => {
    if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
  },
});

export const casesApi = {
  async create(payload: CreateCasePayload, files: File[], onProgress?: ProgressHandler) {
    const form = new FormData();
    form.append('data', JSON.stringify(payload));
    for (const file of files) form.append('files', file, file.name);
    return (
      await api.post<{
        message: string;
        case: { id: string; ucn: string; status: CaseStatus; title: string; documentCount: number };
      }>('/cases', form, multipart(onProgress))
    ).data;
  },

  async summary() {
    return (await api.get<CaseSummary>('/cases/summary')).data;
  },

  async list(params: { page: number; limit: number; search?: string; status?: CaseStatus }) {
    return (await api.get<Paginated<CaseListItem>>('/cases', { params })).data;
  },

  async get(id: string) {
    return (await api.get<CaseDetail>(`/cases/${id}`)).data;
  },

  async addDocuments(id: string, files: File[], onProgress?: ProgressHandler) {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    return (
      await api.post<{ message: string; attached: number }>(
        `/cases/${id}/documents`,
        form,
        multipart(onProgress),
      )
    ).data;
  },

  /** Authenticated download: the cookie is sent by Axios, then the blob is saved with the original name. */
  async download(caseId: string, doc: Pick<CaseDocument, 'id' | 'name'>) {
    const res = await api.get<Blob>(`/cases/${caseId}/documents/${doc.id}/download`, {
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
};
