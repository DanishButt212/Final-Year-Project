import { Badge } from '@/components/ui/badge';
import type { UserStatus, VerificationStatus } from '@/lib/types';

const USER_STATUS: Record<
  UserStatus,
  { variant: 'decided' | 'pending' | 'rejected' | 'neutral'; label: string }
> = {
  ACTIVE: { variant: 'decided', label: 'Active' },
  SUSPENDED: { variant: 'pending', label: 'Suspended' },
  BLOCKED: { variant: 'rejected', label: 'Access revoked' },
  DEACTIVATED: { variant: 'neutral', label: 'Deleted' },
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Access revoked',
  DEACTIVATED: 'Deleted',
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { variant, label } = USER_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const VERIFICATION: Record<
  VerificationStatus,
  { variant: 'decided' | 'pending' | 'rejected'; label: string }
> = {
  VERIFIED: { variant: 'decided', label: 'Verified' },
  PENDING: { variant: 'pending', label: 'Pending verification' },
  REJECTED: { variant: 'rejected', label: 'Rejected' },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { variant, label } = VERIFICATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;
