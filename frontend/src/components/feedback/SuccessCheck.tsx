import { cn } from '@/lib/utils';

/**
 * Animated check: the circle and tick draw once (index.css .da-check). With reduced motion it is shown
 * fully drawn straight away. Decorative; the surrounding text carries the meaning.
 */
export function SuccessCheck({
  className,
  tone = 'primary',
}: {
  className?: string;
  /** primary: green on white; inverse: white on a filled badge. */
  tone?: 'primary' | 'inverse';
}) {
  return (
    <svg
      viewBox="0 0 52 52"
      aria-hidden="true"
      className={cn(
        'da-check size-12',
        tone === 'primary' ? 'text-primary' : 'text-on-primary',
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle className="da-check-circle" cx="26" cy="26" r="23" strokeWidth="3" pathLength={1} />
      <path className="da-check-tick" d="M15 27.5l7.5 7.5L37.5 19" strokeWidth="4" pathLength={1} />
    </svg>
  );
}
