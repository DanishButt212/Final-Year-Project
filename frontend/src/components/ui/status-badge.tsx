import { statusBadge, type CaseStatus } from '@/lib/case-status';
import { Badge } from './badge';

/** Case status as a token-coloured badge with an icon and a text label. */
export function StatusBadge({ status }: { status: CaseStatus }) {
  const { variant, label } = statusBadge(status);
  return <Badge variant={variant}>{label}</Badge>;
}
