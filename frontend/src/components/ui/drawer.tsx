import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Detail drawer: a modal panel that slides in from the right (full width on phones). Focus is trapped by Radix. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(26,26,26,0.5)]" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-heading text-lg font-bold">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-text-muted">
                {description ?? ' '}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-primary-soft hover:text-primary"
              aria-label="Close details"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
