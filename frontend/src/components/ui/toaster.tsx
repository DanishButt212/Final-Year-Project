import { CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { Toaster as Sonner, toast as sonnerToast } from 'sonner';

type Kind = 'success' | 'error' | 'info';

const DURATION_MS = 4000;

const KINDS: Record<
  Kind,
  { label: string; Icon: LucideIcon; badge: string; text: string; bar: string }
> = {
  success: {
    label: 'Success',
    Icon: CheckCircle2,
    badge: 'bg-primary',
    text: 'text-primary',
    bar: 'bg-primary',
  },
  error: {
    label: 'Error',
    Icon: XCircle,
    badge: 'bg-destructive',
    text: 'text-destructive',
    bar: 'bg-destructive',
  },
  info: {
    label: 'Notice',
    Icon: Info,
    badge: 'bg-status-hearing-fg',
    text: 'text-status-hearing-fg',
    bar: 'bg-status-hearing-fg',
  },
};

/**
 * Toast card: white surface, large radius, solid icon badge, a small label so meaning never relies
 * on colour alone, a close button and a thin countdown bar. The drop-in motion and the bar are in
 * index.css (.da-toast, .da-toast-bar) and are switched off for reduced motion.
 */
function ToastCard({ id, kind, message }: { id: string | number; kind: Kind; message: string }) {
  const { label, Icon, badge, text, bar } = KINDS[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="da-toast relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] border border-border bg-surface py-3.5 pr-3 pl-3.5 shadow-[0_12px_32px_rgba(1,65,28,0.18)]"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-on-primary ${badge}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold tracking-wide uppercase ${text}`}>{label}</p>
        <p className="text-[0.9375rem] leading-snug font-semibold text-text">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => sonnerToast.dismiss(id)}
        aria-label="Dismiss notification"
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-muted transition-colors hover:bg-primary-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className={`da-toast-bar absolute inset-x-0 bottom-0 h-1 origin-left ${bar}`}
        style={{ animationDuration: `${DURATION_MS}ms` }}
      />
    </div>
  );
}

function show(kind: Kind, message: string) {
  return sonnerToast.custom((id) => <ToastCard id={id} kind={kind} message={message} />, {
    duration: DURATION_MS,
  });
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
};

/** Mounted once in the app: toasts appear at the top centre of the screen. */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={16}
      visibleToasts={3}
      style={{ '--width': '26rem' } as React.CSSProperties}
    />
  );
}
