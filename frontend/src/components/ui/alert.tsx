import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STYLES = {
  error: {
    box: 'border-status-rejected-border bg-status-rejected-bg text-status-rejected-fg',
    Icon: AlertTriangle,
    role: 'alert' as const,
  },
  success: {
    box: 'border-status-decided-border bg-status-decided-bg text-status-decided-fg',
    Icon: CheckCircle2,
    role: 'status' as const,
  },
  info: {
    box: 'border-status-hearing-border bg-status-hearing-bg text-status-hearing-fg',
    Icon: Info,
    role: 'status' as const,
  },
};

/** Inline message with an icon, so meaning never depends on colour alone. */
export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: keyof typeof STYLES;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon, role } = STYLES[variant];
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
    </div>
  );
}
