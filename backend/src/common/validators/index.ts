import { Transform } from 'class-transformer';
import {
  Matches,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/** Trims whitespace on string values (non-strings pass through to be rejected by validators). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims; an empty result becomes undefined so optional fields can simply be left blank. */
export const TrimOrUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  );

/** Trims and lower-cases (emails, usernames). */
export const TrimLower = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** The decorated field must equal another field of the same object (e.g. confirm password). */
export function Match(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: { message: `${propertyName} must match ${property}.`, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string];
          return value === (args.object as Record<string, unknown>)[related];
        },
      },
    });
  };
}

/**
 * Refuses HTML in names and free text: any "<" or ">" is rejected (React escapes output, but PDFs, exports and
 * e-mails reuse these values). Arrays: pass { each: true }.
 */
export const NoHtml = (options: ValidationOptions = {}) =>
  Matches(/^[^<>]*$/, {
    message: 'Remove the < and > characters. HTML is not allowed.',
    ...options,
  });
