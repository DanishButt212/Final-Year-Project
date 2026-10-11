import { Badge } from '@/components/ui/badge';
import type { UserStatus, VerificationStatus } from '@/lib/types';

import { msg } from '@/i18n';

const USER_STATUS: Record<
  UserStatus,
  { variant: 'decided' | 'pending' | 'rejected' | 'neutral'; label: string }
> = {
  ACTIVE: { variant: 'decided', label: msg('Active') },
  SUSPENDED: { variant: 'pending', label: msg('Suspended') },
  BLOCKED: { variant: 'rejected', label: msg('Access revoked') },
  DEACTIVATED: { variant: 'neutral', label: msg('Deleted') },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { variant, label } = USER_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const VERIFICATION: Record<
  VerificationStatus,
  { variant: 'decided' | 'pending' | 'rejected'; label: string }
> = {
  VERIFIED: { variant: 'decided', label: msg('Verified') },
  PENDING: { variant: 'pending', label: msg('Pending verification') },
  REJECTED: { variant: 'rejected', label: msg('Rejected') },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { variant, label } = VERIFICATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}
