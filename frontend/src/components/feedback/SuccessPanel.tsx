import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import { SuccessCheck } from './SuccessCheck';

/**
 * Confirmation after a completed action (case filed, fee paid): animated check, a heading announced to
 * screen readers, an optional large reference number with a Copy button, and the next actions.
 */
export function SuccessPanel({
  title,
  description,
  reference,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  reference?: { label: string; value: string; copyLabel: string; testId?: string };
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('max-w-2xl', className)}>
      <CardContent className="space-y-5 text-center">
        <SuccessCheck className="mx-auto size-14" />
        <div role="status">
          <h2 className="text-xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-text-muted">{description}</p>}
        </div>
        {reference && (
          <div className="rounded-lg border-2 border-primary bg-primary-soft px-4 py-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {reference.label}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <p
                className="case-number break-all text-2xl font-medium text-primary sm:text-3xl"
                dir="ltr"
                data-testid={reference.testId}
              >
                {reference.value}
              </p>
              <CopyButton value={reference.value} label={reference.copyLabel} />
            </div>
          </div>
        )}
        {children}
        {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
      </CardContent>
    </Card>
  );
}
