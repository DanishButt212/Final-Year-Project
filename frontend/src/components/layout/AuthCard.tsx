import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { ScalesIcon } from './Logo';

/** Centered card used by login, register and password pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="px-4 py-8 sm:py-12">
      <Card className={`mx-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="border-b border-border px-6 py-5 text-center">
          <span className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ScalesIcon />
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        <div className="p-6">{children}</div>
        {footer && (
          <div className="border-t border-border px-6 py-4 text-center text-sm">{footer}</div>
        )}
      </Card>
    </div>
  );
}
