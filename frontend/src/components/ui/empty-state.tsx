import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Helpful empty state: icon, one-line explanation and a single next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  titleAs: Title = 'p',
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Use "h1" when the empty state is the main content of a page. */
  titleAs?: 'p' | 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <Title className="font-heading text-base font-bold">{title}</Title>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
