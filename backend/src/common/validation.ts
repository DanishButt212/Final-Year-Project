import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { Messages } from './messages';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Constraints that mean "this required value is absent or too short to count". */
const MISSING_CONSTRAINTS = ['isNotEmpty', 'isDefined', 'arrayMinSize', 'minLength'];

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function flatten(
  errors: ValidationError[],
  parent = '',
): { details: FieldError[]; missing: boolean } {
  const details: FieldError[] = [];
  let missing = false;
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      details.push({ field, messages: Object.values(e.constraints) });
      const keys = Object.keys(e.constraints);
      const absent = isEmptyValue(e.value) && keys.some((k) => MISSING_CONSTRAINTS.includes(k));
      // A value that is present but shorter than the minimum also counts as incomplete.
      if (absent || keys.includes('minLength')) missing = true;
    }
    if (e.children?.length) {
      const nested = flatten(e.children, field);
      details.push(...nested.details);
      missing = missing || nested.missing;
    }
  }
  return { details, missing };
}

/**
 * Builds the standard 400 response: `missingMessage` when a required value is absent,
 * otherwise "Please correct the highlighted fields.", plus per-field details.
 */
export function buildValidationException(
  errors: ValidationError[],
  missingMessage: string = Messages.MISSING_FIELDS,
): BadRequestException {
  const { details, missing } = flatten(errors);
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: missing ? missingMessage : Messages.INVALID_FIELDS,
    details,
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => buildValidationException(errors),
  });
}
