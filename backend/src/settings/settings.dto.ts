import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CaseType } from '../generated/prisma/client';

const toStringValue = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value;

/** Decimal with at most two places, as text so it can go straight into a Decimal column. */
const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

export class FeeUpdateDto {
  @IsEnum(CaseType)
  caseType: CaseType;

  @Transform(toStringValue)
  @Matches(DECIMAL, { message: 'Fee must be a number of 0 or more with at most two decimals.' })
  amount: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt({ message: 'Max attachment limit must be a whole number of MB.' })
  @Min(1, { message: 'Max attachment limit must be between 1 and 100 MB.' })
  @Max(100, { message: 'Max attachment limit must be between 1 and 100 MB.' })
  maxAttachmentMb?: number;

  @IsOptional()
  @IsBoolean()
  caseRegistrationOpen?: boolean;

  /** Percentage 0 to 100, at most two decimals. */
  @IsOptional()
  @Transform(toStringValue)
  @Matches(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, {
    message: 'Filing fee rate modifier must be a percentage between 0 and 100.',
  })
  filingFeeRateModifier?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FeeUpdateDto)
  fees?: FeeUpdateDto[];
}
