import { api } from './api';
import type { CaseType } from './case-status';
import type { Paginated, Role } from './types';

/** Saves a blob response with a file name (authenticated downloads: the cookie is sent by Axios). */
export async function downloadBlob(url: string, filename: string) {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// ---------------------------------------------------------------- fees and payments

export interface LedgerLine {
  code: 'BASE_FEE' | 'CLAIM_VALUE_FEE' | 'MODIFIER' | 'TOTAL';
  label: string;
  amount: string;
}

export interface Challan {
  id: string;
  challanNo: string;
  caseId: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  amount: string;
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  issuedAt: string;
  dueDate: string;
  overdue: boolean;
  ledger: LedgerLine[];
  payment: { id: string; receiptNo: string | null; paidAt: string | null } | null;
}

export interface PaymentRow {
  id: string;
  date: string;
  caseId: string;
  ucn: string;
  challanNo: string;
  amount: string;
  status: 'SUCCESS' | 'FAILED';
  receiptNo: string | null;
}

export interface CardForm {
  paymentId: string;
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
}

export const feesApi = {
  async getChallan(caseId: string) {
    return (await api.get<{ challan: Challan | null }>(`/cases/${caseId}/challan`)).data.challan;
  },
  async calculate(caseId: string) {
    return (await api.post<{ message: string; challan: Challan }>(`/cases/${caseId}/challan`)).data;
  },
  async checkout(challanId: string) {
    return (
      await api.post<{ paymentId: string; challanNo: string; amount: string }>(
        '/payments/checkout',
        { challanId },
      )
    ).data;
  },
  /** Card data goes straight to the simulated gateway and is not kept anywhere on the client. */
  async authorize(form: CardForm) {
    return (
      await api.post<{
        message: string;
        paymentId: string;
        receiptNo: string;
        amount: string;
        paidAt: string;
      }>('/mock-gateway/authorize', form)
    ).data;
  },
  async myPayments(params: { page: number; limit: number }) {
    return (await api.get<Paginated<PaymentRow>>('/payments/mine', { params })).data;
  },
  downloadChallan: (c: Pick<Challan, 'id' | 'challanNo'>) =>
    downloadBlob(`/challans/${c.id}/pdf`, `${c.challanNo}.pdf`),
  downloadReceipt: (paymentId: string, receiptNo: string) =>
    downloadBlob(`/payments/${paymentId}/receipt`, `${receiptNo}.pdf`),
};

// ---------------------------------------------------------------- evidence vault

export type EvidenceCategory = 'VIDEO' | 'AUDIO' | 'SCANNED_DOCUMENT';

export const EVIDENCE_CATEGORIES: {
  value: EvidenceCategory;
  label: string;
  extensions: string[];
}[] = [
  { value: 'VIDEO', label: 'Video', extensions: ['mp4', 'webm'] },
  { value: 'AUDIO', label: 'Audio', extensions: ['mp3', 'wav', 'm4a'] },
  {
    value: 'SCANNED_DOCUMENT',
    label: 'Scanned Records Document',
    extensions: ['pdf', 'jpg', 'jpeg', 'png'],
  },
];

export interface VaultItem {
  id: string;
  kind: 'PLEADING' | 'EXHIBIT';
  name: string;
  category: EvidenceCategory | null;
  description: string | null;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  locked: boolean;
  lockReason: string | null;
  canEdit: boolean;
}

export interface Vault {
  caseId: string;
  canUpload: boolean;
  uploadBlockedReason: string | null;
  pleadings: VaultItem[];
  exhibits: VaultItem[];
}

export const evidenceApi = {
  async vault(caseId: string) {
    return (await api.get<Vault>(`/cases/${caseId}/vault`)).data;
  },
  async upload(
    caseId: string,
    input: { category: EvidenceCategory; description: string; files: File[] },
    onProgress?: (percent: number) => void,
  ) {
    const form = new FormData();
    form.append('category', input.category);
    form.append('description', input.description);
    for (const f of input.files) form.append('files', f, f.name);
    return (
      await api.post<{ message: string; added: number }>(`/cases/${caseId}/evidence`, form, {
        headers: { 'Content-Type': undefined },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
    ).data;
  },
  async updateDescription(caseId: string, evidenceId: string, description: string) {
    return (
      await api.patch<{ message: string }>(`/cases/${caseId}/evidence/${evidenceId}`, {
        description,
      })
    ).data;
  },
  async remove(caseId: string, evidenceId: string) {
    return (await api.delete<{ message: string }>(`/cases/${caseId}/evidence/${evidenceId}`)).data;
  },
  downloadExhibit: (caseId: string, item: Pick<VaultItem, 'id' | 'name'>) =>
    downloadBlob(`/cases/${caseId}/evidence/${item.id}/download`, item.name),
  downloadPleading: (caseId: string, item: Pick<VaultItem, 'id' | 'name'>) =>
    downloadBlob(`/cases/${caseId}/pleadings/${item.id}/download`, item.name),
  async lock(caseId: string, body: { evidenceIds?: string[]; reason: string }) {
    return (
      await api.post<{ message: string; locked: number }>(
        `/judge/cases/${caseId}/evidence/lock`,
        body,
      )
    ).data;
  },
};

// ---------------------------------------------------------------- preferences and feedback

export interface NotificationPreferences {
  sms: boolean;
  mobilePush: boolean;
  email: boolean;
  inApp?: boolean;
}

export type FeedbackCategory = 'USABILITY' | 'TECHNICAL_ISSUE' | 'SUGGESTION' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'PROCESSED' | 'ARCHIVED';

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'USABILITY', label: 'Usability' },
  { value: 'TECHNICAL_ISSUE', label: 'Technical issue' },
  { value: 'SUGGESTION', label: 'Suggestion' },
  { value: 'OTHER', label: 'Other' },
];

export interface FeedbackItem {
  id: string;
  message: string;
  category: FeedbackCategory;
  rating: number | null;
  status: FeedbackStatus;
  forwardToMaintenance: boolean;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  user: { name: string; role: Role; email: string } | null;
}

export interface FeedbackList extends Paginated<FeedbackItem> {
  summary: {
    byCategory: Partial<Record<FeedbackCategory, number>>;
    byStatus: Partial<Record<FeedbackStatus, number>>;
    averageRating: number | null;
    ratedCount: number;
  };
}

export const feedbackApi = {
  async getPreferences() {
    return (await api.get<NotificationPreferences>('/users/me/notification-preferences')).data;
  },
  async savePreferences(body: NotificationPreferences) {
    const { sms, mobilePush, email } = body;
    return (
      await api.put<{ message: string; preferences: NotificationPreferences }>(
        '/users/me/notification-preferences',
        { sms, mobilePush, email },
      )
    ).data;
  },
  async submit(body: { message: string; category: FeedbackCategory; rating?: number }) {
    return (await api.post<{ message: string }>('/feedback', body)).data;
  },
  async adminList(params: {
    page: number;
    limit: number;
    status?: FeedbackStatus;
    category?: FeedbackCategory;
    search?: string;
  }) {
    return (await api.get<FeedbackList>('/admin/feedback', { params })).data;
  },
  async adminUpdate(id: string, body: { status?: FeedbackStatus; forwardToMaintenance?: boolean }) {
    return (
      await api.patch<{ message: string; feedback: FeedbackItem }>(`/admin/feedback/${id}`, body)
    ).data;
  },
};
