import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArchScalesIcon } from '@/components/brand/ArchScalesIcon';
import { SealLogo } from '@/components/brand/SealLogo';
import { Wordmark } from '@/components/brand/Wordmark';
import { cn } from '@/lib/utils';

/** The arch-and-scales glyph in the current text colour (small inline uses, e.g. the courtroom bar). */
export function ScalesIcon({ className }: { className?: string }) {
  return <ArchScalesIcon size="1em" stroke="currentColor" className={cn('size-6', className)} />;
}

/**
 * Seal plus wordmark, linking home. "inverse" sits on the green app header, "default" on white.
 * `sealRef` and `sealHidden` let the intro fly its seal onto this exact spot.
 */
export function Logo({
  to = '/',
  className,
  tone = 'inverse',
  sealSize = 36,
  urdu = false,
  sealRef,
  sealHidden = false,
  wordmarkClassName,
}: {
  to?: string;
  className?: string;
  tone?: 'default' | 'inverse';
  sealSize?: number;
  urdu?: boolean;
  sealRef?: Ref<HTMLSpanElement>;
  sealHidden?: boolean;
  /** For example "hidden sm:inline-flex" where the header is tight on phones. */
  wordmarkClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      aria-label={t('DigitalAdaalat home')}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-md no-underline',
        tone === 'inverse' ? 'focus-visible:outline-white' : '',
        className,
      )}
    >
      <span
        ref={sealRef}
        className="inline-flex shrink-0"
        style={{ visibility: sealHidden ? 'hidden' : undefined }}
      >
        <SealLogo size={sealSize} title="" />
      </span>
      <Wordmark tone={tone} urdu={urdu} className={wordmarkClassName} />
    </Link>
  );
}
