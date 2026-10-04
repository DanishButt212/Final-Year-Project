import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      align="end"
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-56 rounded-md border border-border bg-surface p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]',
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      'flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-primary-soft [&_svg]:size-4 [&_svg]:shrink-0',
      destructive ? 'text-destructive' : 'text-text',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = () => (
  <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
);
