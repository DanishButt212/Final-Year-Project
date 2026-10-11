import type { UserStatus } from '@/lib/types';

import { msg } from '@/i18n';

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: msg('Active'),
  SUSPENDED: msg('Suspended'),
  BLOCKED: msg('Access revoked'),
  DEACTIVATED: msg('Deleted'),
};

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;
