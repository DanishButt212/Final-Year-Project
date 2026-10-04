import { AlertTriangle, CalendarCheck, CheckCircle2, Clock, Circle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  decided: {
    cls: 'border-status-decided-border bg-status-decided-bg text-status-decided-fg',
    Icon: CheckCircle2,
  },
  pending: {
    cls: 'border-status-pending-border bg-status-pending-bg text-status-pending-fg',
    Icon: Clock,
  },
  rejected: {
    cls: 'border-status-rejected-border bg-status-rejected-bg text-status-rejected-fg',
    Icon: XCircle,
  },
  overdue: {
    cls: 'border-status-rejected-border bg-status-rejected-bg text-status-rejected-fg',
    Icon: AlertTriangle,
  },
  hearing: {
    cls: 'border-status-hearing-border bg-status-hearing-bg text-status-hearing-fg',
    Icon: CalendarCheck,
  },
  neutral: { cls: 'border-border bg-surface text-text-muted', Icon: Circle },
  accent: { cls: 'border-accent bg-accent-soft text-text', Icon: Circle },
};

export type BadgeVariant = keyof typeof VARIANTS;

/**
 * Status badge. Always shows an icon AND a text label, and wraps instead of clipping,
 * so the status is never conveyed by colour alone.
 */
export function Badge({
  variant = 'neutral',
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const { cls, Icon } = VARIANTS[variant];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold leading-5',
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="break-words">{children}</span>
    </span>
  );
}
