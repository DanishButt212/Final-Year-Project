import { CaseStatus } from '../generated/prisma/client';

/** Cases that count towards a judge's workload and the "active" metric. */
export const ACTIVE_CASE_STATUSES: CaseStatus[] = [
  'FILED',
  'UNDER_SCRUTINY',
  'ALLOCATED',
  'PENDING',
  'HEARING_FIXED',
];

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const personName = { select: { firstName: true, lastName: true } } as const;
export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;
