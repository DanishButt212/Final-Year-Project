import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { Toaster as Sonner, toast } from 'sonner';

/** Toasts: centred on screen, 4 s, flat rounded card with an icon (not colour alone). Position and animation live in index.css (.da-toaster). */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      duration={4000}
      className="da-toaster"
      closeButton
      icons={{
        success: <CheckCircle2 className="size-4 text-status-decided-fg" aria-hidden="true" />,
        error: <XCircle className="size-4 text-destructive" aria-hidden="true" />,
        info: <Info className="size-4 text-status-hearing-fg" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-2xl !border !border-border !bg-surface !text-text !shadow-[0_8px_24px_rgba(0,0,0,0.12)] !font-sans',
          description: '!text-text-muted',
          closeButton: '!border-border !bg-surface !text-text',
        },
      }}
    />
  );
}

export { toast };
