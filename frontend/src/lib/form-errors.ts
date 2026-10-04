import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { parseApiError } from './api';

/**
 * Turns an API error into a form-level message and highlights the fields the server complained about.
 * Returns the message to show in the form's alert.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string {
  const body = parseApiError(error);
  for (const detail of body.details ?? []) {
    if (knownFields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.messages[0] });
    }
  }
  return body.message;
}
