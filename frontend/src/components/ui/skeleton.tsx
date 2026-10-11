import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

/** Loading placeholder: flat grey block with a very soft pulse (disabled for reduced-motion users globally). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-border/70', className)} />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t('Loading')}
      className="space-y-2 rounded-lg border border-border bg-surface p-4"
    >
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid gap-3"
          // i18n-ignore
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-5" />
          ))}
        </div>
      ))}
      <span className="sr-only">{t('Loading…')}</span>
    </div>
  );
}
