import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** The element to focus when a dialog closes: its opener, or the menu button when it was opened from a menu. */
function findOpener(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return null;
  const menu = active.closest<HTMLElement>('[role="menu"]');
  if (menu?.id)
    return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? null;
  return active;
}

/**
 * Modal with a solid overlay (no blur) and focus trapping provided by Radix. On close, focus returns to the
 * element that opened it (also for dialogs opened from a dropdown menu, whose item no longer exists).
 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  // Captured each time the dialog opens, just before Radix moves focus inside (this wrapper itself may stay
  // mounted while the dialog is closed, so a value from its first render could be stale).
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(26,26,26,0.5)]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-[0_8px_24px_rgba(0,0,0,0.12)]',
          className,
        )}
        onOpenAutoFocus={(e) => {
          opener.current = findOpener();
          onOpenAutoFocus?.(e);
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e);
          const el = opener.current;
          if (e.defaultPrevented || !el?.isConnected) return;
          e.preventDefault();
          el.focus();
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-primary-soft hover:text-primary"
          aria-label="Close dialog"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 space-y-1 pr-8', className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-heading text-lg font-bold', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
