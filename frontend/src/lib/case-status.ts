import type { BadgeVariant } from '@/components/ui/badge';

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
  { value: 'CIVIL_SUIT', label: 'Civil Suit' },
  { value: 'CRIMINAL_APPEAL', label: 'Criminal Appeal' },
  { value: 'WRIT_PETITION', label: 'Writ Petition' },
  { value: 'BAIL_APPLICATION', label: 'Bail Application' },
];

export const caseTypeLabel = (type: CaseType) =>
  CASE_TYPES.find((t) => t.value === type)?.label ?? type;

/**
 * Status -> badge colour and wording, following MASTER.md:
 * Decided = green, Pending = amber, Rejected/Overdue = red, Hearing Fixed = blue-grey.
 */
export const STATUS_BADGES: Record<CaseStatus, { variant: BadgeVariant; label: string }> = {
  DRAFT: { variant: 'neutral', label: 'Draft' },
  PENDING_ASSIGNMENT: { variant: 'pending', label: 'Pending Assignment' },
  FILED: { variant: 'pending', label: 'Filed' },
  UNDER_SCRUTINY: { variant: 'pending', label: 'Under Scrutiny' },
  ALLOCATED: { variant: 'pending', label: 'Allocated to Judge' },
  PENDING: { variant: 'pending', label: 'Pending' },
  HEARING_FIXED: { variant: 'hearing', label: 'Hearing Fixed' },
  DECIDED: { variant: 'decided', label: 'Decided' },
  REJECTED: { variant: 'rejected', label: 'Rejected' },
  DISMISSED: { variant: 'rejected', label: 'Dismissed' },
};

export const CLOSED_STATUSES: CaseStatus[] = ['DECIDED', 'REJECTED', 'DISMISSED'];

/** "Judge name · Courtroom", or "Not yet assigned" before allocation. */
export const judgeBench = (c: { judge: string | null; courtroom: string | null }) =>
  c.judge ? `${c.judge}${c.courtroom ? ` · ${c.courtroom}` : ''}` : 'Not yet assigned';

export function statusBadge(status: CaseStatus) {
  return STATUS_BADGES[status] ?? { variant: 'neutral' as const, label: status };
}
