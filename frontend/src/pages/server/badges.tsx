import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, type Priority, type SummonsStatus } from '@/lib/summons-api';

const VARIANT = {
  PENDING_ASSIGNMENT: 'pending',
  ASSIGNED: 'hearing',
  ATTEMPT_IN_PROGRESS: 'accent',
  EXECUTED: 'decided',
  CANCELLED: 'neutral',
} as const;

export function SummonsStatusBadge({ status }: { status: SummonsStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return priority === 'URGENT' ? (
    <Badge variant="rejected">Urgent</Badge>
  ) : (
    <Badge variant="neutral">Normal</Badge>
  );
}

export function OverdueBadge({ overdue }: { overdue: boolean }) {
  return overdue ? <Badge variant="overdue">Overdue</Badge> : null;
}
