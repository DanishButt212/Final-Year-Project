import * as PopoverPrimitive from '@radix-ui/react-popover';
import { BookOpen } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { GLOSSARY_TERMS } from '@/lib/glossary-terms';
import { cn } from '@/lib/utils';

const TermCard = lazy(() => import('./TermCard'));
const preload = () => void import('./TermCard');

/**
 * A legal term with a short explanation: dotted underline, opens on hover (mouse), tap or Enter/Space, closes on
 * Escape or when the pointer leaves. The explanation links to the full glossary entry. Without children it
 * shows the term itself.
 */
export function Term({
  id,
  children,
  className,
}: {
  id: string;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const term = GLOSSARY_TERMS[id];
  if (!term) return <>{children}</>;

  const hoverOpen = (e: React.PointerEvent) => {
    preload();
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 250);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 200);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        type="button"
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
        onFocus={preload}
        className={cn(
          'cursor-help rounded-sm text-inherit underline decoration-text-muted decoration-dotted decoration-1 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          className,
        )}
      >
        {children ?? t(term)}
        <span className="sr-only"> {t('(what this means)')}</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 text-start text-sm font-normal normal-case tracking-normal text-text shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <Suspense fallback={<p className="font-heading font-bold">{t(term)}</p>}>
            <TermCard id={id} />
          </Suspense>
          <Link
            to={`/glossary#${id}`}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 font-semibold text-primary"
            onClick={() => setOpen(false)}
          >
            <BookOpen className="size-4" aria-hidden="true" /> {t('Open the glossary')}
          </Link>
          <PopoverPrimitive.Arrow className="fill-surface" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** "Legal terms on this page: A · B · C", each with its explanation; for forms where a label cannot hold one. */
export function TermsHint({ ids, className }: { ids: string[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn('text-sm text-text-muted', className)}>
      {t('Legal terms on this page:')}{' '}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ' · '}
          <Term id={id} />
        </span>
      ))}
    </p>
  );
}
