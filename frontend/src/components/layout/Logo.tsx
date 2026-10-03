import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** Simple scales-of-justice mark. Original artwork: not the State Emblem or any court's logo. */
export function ScalesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 7a3 3 0 0 0 6 0L5 7z" />
      <path d="M19 7l-3 7a3 3 0 0 0 6 0l-3-7z" />
    </svg>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-on-primary no-underline focus-visible:outline-white',
        className,
      )}
    >
      <ScalesIcon />
      <span className="font-heading text-lg font-bold tracking-tight">DigitalAdaalat</span>
    </Link>
  );
}
