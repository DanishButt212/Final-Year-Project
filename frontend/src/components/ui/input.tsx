import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClasses =
  'block w-full min-h-10 rounded-md border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/70 disabled:bg-background disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:border-2 focus-visible:border-primary';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn(inputClasses, className)} {...props} />
));
Input.displayName = 'Input';

/** Password field with a show/hide toggle (keyboard accessible, state announced). */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(inputClasses, 'pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-text-muted hover:text-primary"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClasses, 'min-h-24', className)} {...props} />
));
Textarea.displayName = 'Textarea';
