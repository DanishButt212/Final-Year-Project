import * as React from 'react';
import { inputClasses } from '@/components/ui/input';
import { toLocalPhone, toStoredPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue'
> & {
  /** Controlled use: the stored value "+92 3XX XXXXXXX". Leave out with react-hook-form's register(). */
  value?: string;
};

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;

/**
 * Mobile number with a fixed "+92" prefix and a "3XX XXXXXXX" mask. The visible field holds only the local part;
 * a hidden field carries the stored value "+92 3XX XXXXXXX" and receives the forwarded ref, name and events, so
 * it works with react-hook-form's register() (defaults and reset() update the display) as well as controlled.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, name, onChange, onBlur, value, disabled, ...props }, ref) => {
    const [local, setLocal] = React.useState(() => toLocalPhone(value ?? ''));
    const visible = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
      if (value !== undefined) setLocal(toLocalPhone(value));
    }, [value]);

    const hiddenRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        if (el) {
          // react-hook-form writes defaults and reset() values straight to the element: mirror them on screen.
          Object.defineProperty(el, 'value', {
            configurable: true,
            get: () => nativeValue.get!.call(el),
            set: (v: unknown) => {
              nativeValue.set!.call(el, v);
              setLocal(toLocalPhone(String(v ?? '')));
            },
          });
          // Focusing the field on a validation error should land in the visible box.
          el.focus = () => visible.current?.focus();
        }
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    return (
      <div className={cn('flex', className)}>
        <span
          aria-hidden="true"
          className="inline-flex min-h-10 items-center rounded-l-md border border-r-0 border-border bg-background px-3 font-mono text-base text-text-muted"
        >
          +92
        </span>
        <input
          ref={visible}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="3XX XXXXXXX"
          disabled={disabled}
          value={local}
          className={cn(inputClasses, 'rounded-l-none font-mono')}
          onChange={(e) => {
            const next = toLocalPhone(e.target.value);
            setLocal(next);
            const stored = toStoredPhone(next);
            const hidden = visible.current?.nextElementSibling as HTMLInputElement | null;
            if (hidden) nativeValue.set!.call(hidden, stored);
            onChange?.({ target: { name, value: stored }, type: 'change' } as never);
          }}
          onBlur={(e) => onBlur?.({ ...e, target: { name, value: toStoredPhone(local) } } as never)}
          {...props}
        />
        <input ref={hiddenRef} type="hidden" name={name} defaultValue={toStoredPhone(local)} />
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
