import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { Toaster as Sonner, toast } from 'sonner';

/** Toasts: top-right, 5 s, flat card with an icon (not colour alone). */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      duration={5000}
      closeButton
      icons={{
        success: <CheckCircle2 className="size-4 text-status-decided-fg" aria-hidden="true" />,
        error: <XCircle className="size-4 text-destructive" aria-hidden="true" />,
        info: <Info className="size-4 text-status-hearing-fg" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border !bg-surface !text-text !shadow-[0_8px_24px_rgba(0,0,0,0.12)] !font-sans',
          description: '!text-text-muted',
          closeButton: '!border-border !bg-surface !text-text',
        },
      }}
    />
  );
}

export { toast };
