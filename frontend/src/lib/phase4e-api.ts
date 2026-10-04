import { api } from './api';
import type { CaseType } from './case-status';
import type { DecisionType } from './cases-api';
import type { Paginated } from './types';

// ---------------------------------------------------------------- judge decisions

export const judgeApi = {
  async recordOutcome(
    hearingId: string,
    body: { status: 'COMPLETED' | 'ADJOURNED'; orderNotes: string },
  ) {
    return (await api.post<{ message: string }>(`/judge/hearings/${hearingId}/outcome`, body)).data;
  },
  async decide(caseId: string, body: { decisionType: DecisionType; orderText: string }) {
    return (await api.post<{ message: string }>(`/judge/cases/${caseId}/decide`, body)).data;
  },
};

// ---------------------------------------------------------------- audit vault

export interface AuditRow {
  id: string;
  eventId: string;
  userHash: string;
  actor: { name: string; email: string } | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  success: boolean;
  createdAt: string;
  legacy: boolean;
}

export interface AuditDetail {
  id: string;
  eventId: string;
  userHash: string;
  actor: { id: string; name: string; email: string } | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  success: boolean;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  eventHash: string | null;
  integrity: 'valid' | 'mismatch' | 'legacy';
}

export interface AuditFilters {
  q?: string;
  action?: string;
  entity?: string;
  actor?: string;
  from?: string;
  to?: string;
  outcome?: 'all' | 'success' | 'failure';
}

export interface AuditVerification {
  from: string | null;
  to: string | null;
  total: number;
  valid: number;
  mismatched: number;
  legacy: number;
  mismatchedIds: string[];
  checkedAt: string;
}

const clean = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

export const auditApi = {
  async list(params: AuditFilters & { page: number; limit: number }) {
    return (await api.get<Paginated<AuditRow>>('/admin/audit-logs', { params: clean(params) }))
      .data;
  },
  async facets() {
    return (await api.get<{ actions: string[]; entities: string[] }>('/admin/audit-logs/facets'))
      .data;
  },
  async detail(id: string) {
    return (await api.get<AuditDetail>(`/admin/audit-logs/${id}`)).data;
  },
  async verify(params: { from?: string; to?: string }) {
    return (await api.get<AuditVerification>('/admin/audit-logs/verify', { params: clean(params) }))
      .data;
  },
};

// ---------------------------------------------------------------- security

export interface SecurityAlert {
  id: string;
  status: 'OPEN' | 'DISMISSED' | 'BLOCKED';
  ip: string | null;
  account: { id: string | null; name: string | null; email: string } | null;
  role: string | null;
  attemptCount: number;
  lastActionCode: string;
  lastRoute: string | null;
  createdAt: string;
  resolvedAt: string | null;
  loopback: boolean;
  hostBlocked: boolean;
}

export interface SecurityAlertDetail extends SecurityAlert {
  resolvedBy: string | null;
  events: {
    id: string;
    createdAt: string;
    method: string;
    route: string;
    code: string;
    ip: string | null;
  }[];
}

export interface BlockedHost {
  id: string;
  ip: string;
  reason: string;
  createdAt: string;
  createdBy: string;
  alertId: string | null;
  enforced: boolean;
  note: string | null;
}

export const securityApi = {
  async summary() {
    return (await api.get<{ openCount: number }>('/admin/security/summary')).data;
  },
  async alerts(status?: SecurityAlert['status']) {
    return (
      await api.get<{ openCount: number; data: SecurityAlert[] }>('/admin/security/alerts', {
        params: status ? { status } : {},
      })
    ).data;
  },
  async alert(id: string) {
    return (await api.get<SecurityAlertDetail>(`/admin/security/alerts/${id}`)).data;
  },
  async blacklist(id: string, reason?: string) {
    return (
      await api.post<{ message: string; enforced: boolean; note?: string }>(
        `/admin/security/alerts/${id}/blacklist`,
        reason ? { reason } : {},
      )
    ).data;
  },
  async dismiss(id: string) {
    return (await api.post<{ message: string }>(`/admin/security/alerts/${id}/dismiss`)).data;
  },
  async blockedHosts() {
    return (await api.get<{ data: BlockedHost[] }>('/admin/security/blocked-hosts')).data.data;
  },
  async unblock(id: string) {
    return (await api.delete<{ message: string }>(`/admin/security/blocked-hosts/${id}`)).data;
  },
};

// ---------------------------------------------------------------- reports

export interface PerformanceFilters {
  year: number;
  monthFrom: number;
  monthTo: number;
  caseType?: CaseType | '';
  judgeId?: string;
  courtId?: string;
}

export interface Bucket {
  key: string;
  label: string;
  filed: number;
  decided: number;
  pending: number;
  disposalRatePercent: number | null;
  avgTrialDays: number | null;
}

export interface PerformanceReport {
  params: {
    year: number;
    monthFrom: number;
    monthTo: number;
    caseType: CaseType | null;
    judgeId: string | null;
    courtId: string | null;
    periodLabel: string;
    judgeLabel: string | null;
    courtLabel: string | null;
  };
  summary: {
    filed: number;
    decided: number;
    pending: number;
    disposalRatePercent: number | null;
    avgTrialDays: number | null;
    avgHearingsPerDecided: number | null;
  };
  monthly: { month: string; label: string; filed: number; decided: number }[];
  byCaseType: Bucket[];
  byJudge: Bucket[];
  byCourt: Bucket[];
}

export interface ReportOptions {
  judges: { id: string; name: string; courtId: string | null }[];
  courts: { id: string; name: string }[];
  caseTypes: { value: CaseType; label: string }[];
}

export type ReportKind = 'PERFORMANCE' | 'AUDIT_TRAIL';
export type ReportFormat = 'PDF' | 'EXCEL';

export interface ReportHistoryRow {
  id: string;
  code: string;
  kind: ReportKind;
  format: ReportFormat;
  params: Record<string, unknown>;
  rowCount: number;
  fileSha256: string;
  createdAt: string;
  generatedBy: string;
}

export interface ReportVerification {
  code: string;
  status: 'valid' | 'tampered';
  fileMatches: boolean;
  sealMatches: boolean;
  message: string;
  checkedAt: string;
}

function fileNameOf(disposition: string | undefined, fallback: string) {
  const m = /filename="?([^";]+)"?/i.exec(disposition ?? '');
  return m ? m[1] : fallback;
}

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const reportsApi = {
  async options() {
    return (await api.get<ReportOptions>('/admin/reports/options')).data;
  },
  async compile(f: PerformanceFilters) {
    return (await api.get<PerformanceReport>('/admin/reports/performance', { params: clean(f) }))
      .data;
  },
  /** "Execute Data Export Compilation": downloads the stamped file and returns its verification code. */
  async exportFile(body: {
    kind: ReportKind;
    format: ReportFormat;
    params: Record<string, unknown>;
  }) {
    const res = await api.post<Blob>('/admin/reports/export', body, { responseType: 'blob' });
    const code = (res.headers['x-report-code'] as string | undefined) ?? '';
    save(
      res.data,
      fileNameOf(res.headers['content-disposition'] as string | undefined, `${code || 'report'}`),
    );
    return { code };
  },
  async history(page: number) {
    return (
      await api.get<Paginated<ReportHistoryRow>>('/admin/reports/history', {
        params: { page, limit: 10 },
      })
    ).data;
  },
  async download(row: ReportHistoryRow) {
    const res = await api.get<Blob>(`/admin/reports/${row.id}/download`, { responseType: 'blob' });
    save(res.data, fileNameOf(res.headers['content-disposition'] as string | undefined, row.code));
  },
  async verify(id: string) {
    return (await api.post<ReportVerification>(`/admin/reports/${id}/verify`)).data;
  },
};
