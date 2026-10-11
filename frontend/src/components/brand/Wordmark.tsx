import { cn } from '@/lib/utils';

export interface WordmarkProps {
  /** "default" on light surfaces, "inverse" on the green header. */
  tone?: 'default' | 'inverse';
  /** Adds the Urdu line "ڈیجیٹل عدالت" under the name. */
  urdu?: boolean;
  className?: string;
  /** Font size of the name in rem; the Urdu line scales with it. */
  size?: number;
}

/**
 * "Digital" in Inter 500 (muted) immediately followed by "Adaalat" in Merriweather 900 (primary).
 * The name is a brand and is never translated or mirrored; it always reads left to right.
 */
export function Wordmark({
  tone = 'default',
  urdu = false,
  className,
  size = 1.125,
}: WordmarkProps) {
  const inverse = tone === 'inverse';
  return (
    <span className={cn('inline-flex flex-col items-start leading-none', className)} dir="ltr">
      <span
        lang="en"
        className="inline-flex items-baseline whitespace-nowrap text-start"
        style={{ fontSize: `${size}rem`, lineHeight: 1.15 }}
      >
        <span
          className={cn(
            'font-sans font-medium tracking-[-0.025em]',
            inverse ? 'text-white/85' : 'text-text-muted',
          )}
        >
          {/* i18n-ignore: brand name, never translated */}
          Digital
        </span>
        <span
          className={cn(
            'font-heading tracking-[-0.035em]',
            inverse ? 'text-white' : 'text-primary',
          )}
          style={{ fontWeight: 900, lineHeight: 1 }}
        >
          {/* i18n-ignore: brand name, never translated */}
          Adaalat
        </span>
      </span>
      {urdu && (
        <span
          lang="ur"
          dir="rtl"
          className={cn(
            'urdu-wordmark self-start text-start',
            inverse ? 'text-white/90' : 'text-text-muted',
          )}
          style={{ fontSize: `${size * 0.62}rem` }}
        >
          ڈیجیٹل عدالت
        </span>
      )}
    </span>
  );
}
