import type { UserStatus } from '@/lib/types';

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Access revoked',
  DEACTIVATED: 'Deleted',
};

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;
