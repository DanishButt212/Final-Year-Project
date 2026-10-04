import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClasses } from './input';

/** A styled native <select>: fully keyboard and screen-reader accessible, works on every phone. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(inputClasses, 'appearance-none pr-10', className)} {...props}>
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      aria-hidden="true"
    />
  </div>
));
NativeSelect.displayName = 'NativeSelect';
