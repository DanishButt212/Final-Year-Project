import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { Messages } from './messages';

export interface FieldError {
  field: string;
  messages: string[];
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
      const value = e.value as unknown;
      const isEmpty = value === undefined || value === null || value === '';
      if (isEmpty && ('isNotEmpty' in e.constraints || 'isDefined' in e.constraints))
        missing = true;
    }
    if (e.children?.length) {
      const nested = flatten(e.children, field);
      details.push(...nested.details);
      missing = missing || nested.missing;
    }
  }
  return { details, missing };
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => {
      const { details, missing } = flatten(errors);
      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: missing ? Messages.MISSING_FIELDS : Messages.INVALID_FIELDS,
        details,
      });
    },
  });
}
