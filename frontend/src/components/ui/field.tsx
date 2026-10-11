import { useTranslation } from 'react-i18next';
import { translateText } from '@/lib/server-messages';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Render prop receives the id and aria attributes to spread onto the control. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/** Label + control + hint + inline validation message, wired together for screen readers. */
export function Field({ label, error, hint, required, children }: FieldProps) {
  useTranslation(); // re-render on language change; label, hint and error may be untranslated constants
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {translateText(label)}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-text-muted">
          {translateText(hint)}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{translateText(error)}</span>
        </p>
      )}
    </div>
  );
}
