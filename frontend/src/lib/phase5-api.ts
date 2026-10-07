import { api } from './api';
import { downloadBlob } from './phase4-api';
import type { Paginated } from './types';

// ---------------------------------------------------------------- judge orders

export type OrderOutcome = 'COMPLETED' | 'ADJOURNED' | 'JUDGMENT' | 'DISMISSED' | 'DISPOSED';

export const ORDER_OUTCOME_LABEL: Record<OrderOutcome, string> = {
  COMPLETED: 'Hearing completed',
  ADJOURNED: 'Adjourned',
  JUDGMENT: 'Judgment',
  DISMISSED: 'Dismissed',
  DISPOSED: 'Disposed of',
};

export interface JudgeOrder {
  id: string;
  kind: 'HEARING_OUTCOME' | 'DECISION';
  outcome: OrderOutcome;
  caseId: string;
  ucn: string;
  title: string;
  parties: string[];
  hearingDate: string | null;
  hearingTime: string | null;
  summary: string | null;
  recordedAt: string;
}

export const judgeOrdersApi = {
  async list(params: { page: number; limit: number; search?: string; outcome?: OrderOutcome }) {
    return (await api.get<Paginated<JudgeOrder>>('/judge/orders', { params })).data;
  },
};

// ---------------------------------------------------------------- intern completion certificate

export interface Certificate {
  id: string;
  certificateNo: string;
  internName: string;
  lawyerName: string;
  chamberName: string;
  chamberCode: string;
  periodFrom: string;
  periodTo: string;
  approvedLogs: number;
  attendanceDays: number;
  issuedAt: string;
  seal: string;
}

export interface SealCheck {
  valid: boolean;
  certificateNo: string;
  message: string;
}

export const certificateApi = {
  // Supervising lawyer
  async forIntern(internId: string) {
    return (
      await api.get<{
        eligible: boolean;
        approvedLogs: number;
        message: string | null;
        certificate: Certificate | null;
      }>(`/chamber/interns/${internId}/certificate`)
    ).data;
  },
  async issue(internId: string) {
    return (
      await api.post<{ message: string; certificate: Certificate }>(
        `/chamber/interns/${internId}/certificate`,
      )
    ).data;
  },
  async lawyerVerify(internId: string) {
    return (await api.post<SealCheck>(`/chamber/interns/${internId}/certificate/verify`)).data;
  },
  lawyerDownload(internId: string, certificateNo: string) {
    return downloadBlob(`/chamber/interns/${internId}/certificate/pdf`, `${certificateNo}.pdf`);
  },
  // Intern
  async mine() {
    return (
      await api.get<{ certificate: Certificate | null; message: string | null }>(
        '/intern/certificate',
      )
    ).data;
  },
  async verify() {
    return (await api.post<SealCheck>('/intern/certificate/verify')).data;
  },
  download(certificateNo: string) {
    return downloadBlob('/intern/certificate/pdf', `${certificateNo}.pdf`);
  },
};
