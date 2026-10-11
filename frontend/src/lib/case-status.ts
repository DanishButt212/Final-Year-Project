import type { BadgeVariant } from '@/components/ui/badge';
import i18n, { msg } from '@/i18n';

export type CaseStatus =
  | 'DRAFT'
  | 'PENDING_ASSIGNMENT'
  | 'FILED'
  | 'UNDER_SCRUTINY'
  | 'ALLOCATED'
  | 'PENDING'
  | 'HEARING_FIXED'
  | 'DECIDED'
  | 'REJECTED'
  | 'DISMISSED';

export type CaseType = 'CIVIL_SUIT' | 'CRIMINAL_APPEAL' | 'WRIT_PETITION' | 'BAIL_APPLICATION';

export const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: 'CIVIL_SUIT', label: msg('Civil Suit') },
  { value: 'CRIMINAL_APPEAL', label: msg('Criminal Appeal') },
  { value: 'WRIT_PETITION', label: msg('Writ Petition') },
  { value: 'BAIL_APPLICATION', label: msg('Bail Application') },
];

/** The case category in the current language. */
export const caseTypeLabel = (type: CaseType) =>
  i18n.t(CASE_TYPES.find((ct) => ct.value === type)?.label ?? type);

/**
 * Status -> badge colour and wording, following MASTER.md:
 * Decided = green, Pending = amber, Rejected/Overdue = red, Hearing Fixed = blue-grey.
 */
export const STATUS_BADGES: Record<CaseStatus, { variant: BadgeVariant; label: string }> = {
  DRAFT: { variant: 'neutral', label: msg('Draft') },
  PENDING_ASSIGNMENT: { variant: 'pending', label: msg('Pending Assignment') },
  FILED: { variant: 'pending', label: msg('Filed') },
  UNDER_SCRUTINY: { variant: 'pending', label: msg('Under Scrutiny') },
  ALLOCATED: { variant: 'pending', label: msg('Allocated to Judge') },
  PENDING: { variant: 'pending', label: msg('Pending') },
  HEARING_FIXED: { variant: 'hearing', label: msg('Hearing Fixed') },
  DECIDED: { variant: 'decided', label: msg('Decided') },
  REJECTED: { variant: 'rejected', label: msg('Rejected') },
  DISMISSED: { variant: 'rejected', label: msg('Dismissed') },
};

export const CLOSED_STATUSES: CaseStatus[] = ['DECIDED', 'REJECTED', 'DISMISSED'];

/** "Judge name · Courtroom", or "Not yet assigned" before allocation. */
export const judgeBench = (c: { judge: string | null; courtroom: string | null }) =>
  c.judge ? `${c.judge}${c.courtroom ? ` · ${c.courtroom}` : ''}` : i18n.t('Not yet assigned');

export function statusBadge(status: CaseStatus) {
  return STATUS_BADGES[status] ?? { variant: 'neutral' as const, label: status };
}
