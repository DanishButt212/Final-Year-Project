import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, type Priority, type ServiceMode, type SummonsStatus } from '@/lib/summons-api';
import { useTranslation } from 'react-i18next';

const VARIANT = {
  PENDING_ASSIGNMENT: 'pending',
  ASSIGNED: 'hearing',
  ATTEMPT_IN_PROGRESS: 'accent',
  EXECUTED: 'decided',
  CANCELLED: 'neutral',
} as const;

export function SummonsStatusBadge({ status, serviceMode }: {
  status: SummonsStatus;
  serviceMode?: ServiceMode | null;
}) {
  const { t } = useTranslation();
  if (status === 'EXECUTED' && serviceMode === 'REFUSED_AFFIXED') {
    return <Badge variant="rejected">{t('Refused')}</Badge>;
  }
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  return priority === 'URGENT' ? (
    <Badge variant="rejected">{t('Urgent')}</Badge>
  ) : (
    <Badge variant="neutral">{t('Normal')}</Badge>
  );
}

export function OverdueBadge({ overdue }: { overdue: boolean }) {
  const { t } = useTranslation();
  return overdue ? <Badge variant="overdue">{t('Overdue')}</Badge> : null;
}
