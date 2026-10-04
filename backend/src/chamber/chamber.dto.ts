import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { CNIC_MESSAGE, CNIC_REGEX, PHONE_MESSAGE, PHONE_REGEX } from '../common/patterns';
import { Trim, TrimLower, TrimOrUndefined } from '../common/validators';

const trimList = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== ''))]
    : value;

@ValidatorConstraint({ name: 'quarterHour', async: false })
class QuarterHour implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'number' && Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;
  }
  defaultMessage() {
    return 'Hours must be in steps of 0.25, between 0.25 and 24.';
  }
}

@ValidatorConstraint({ name: 'twoDecimals', async: false })
class TwoDecimals implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'number' && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
  }
  defaultMessage() {
    return 'Enter an amount with at most two decimals.';
  }
}

export class UpdateChamberProfileDto {
  @Trim()
  @IsNotEmpty({ message: 'Enter the chamber name.' })
  @IsString()
  @MaxLength(120)
  name: string;

  @Trim()
  @IsNotEmpty({ message: 'Enter the office physical address.' })
  @IsString()
  @MaxLength(300)
  officeAddress: string;

  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(10, { message: 'Add at most 10 sub-partners.' })
  @IsString({ each: true })
  @MaxLength(80, { each: true, message: 'Each name can be at most 80 characters.' })
  partnerNames: string[];

  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(10, { message: 'Add at most 10 membership IDs.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: 'Each ID can be at most 40 characters.' })
  barMembershipIds: string[];

  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(12, { message: 'Add at most 12 practice verticals.' })
  @IsString({ each: true })
  @MaxLength(60, { each: true, message: 'Each vertical can be at most 60 characters.' })
  practiceVerticals: string[];

  @TrimOrUndefined()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120)
  email?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Hourly rate must be between PKR 1 and PKR 1,000,000.' })
  @Max(1_000_000, { message: 'Hourly rate must be between PKR 1 and PKR 1,000,000.' })
  defaultHourlyRatePkr: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Threshold must be between PKR 0 and PKR 100,000,000.' })
  @Max(100_000_000, { message: 'Threshold must be between PKR 0 and PKR 100,000,000.' })
  lowBalanceThresholdPkr: number;
}

export class ClientListQueryDto extends PageQueryDto {
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateClientDto {
  @Trim()
  @IsNotEmpty({ message: 'Enter the client name.' })
  @IsString()
  @MaxLength(120)
  name: string;

  @Trim()
  @IsNotEmpty()
  @Matches(CNIC_REGEX, { message: CNIC_MESSAGE })
  cnic: string;

  @Trim()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone: string;

  @Trim()
  @IsNotEmpty({ message: 'Choose or enter the case type.' })
  @IsString()
  @MaxLength(60)
  caseType: string;

  /** YYYY-MM-DD, defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Enter a valid onboarding date.' })
  onboardedOn?: string;
}

export class UpdateClientDto {
  @TrimOrUndefined()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120)
  email?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  caseType?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateBillableDto {
  @IsUUID()
  clientId: string;

  @IsNumber({}, { message: 'Enter the hours worked.' })
  @Min(0.25, { message: 'Hours must be in steps of 0.25, between 0.25 and 24.' })
  @Max(24, { message: 'Hours must be in steps of 0.25, between 0.25 and 24.' })
  @Validate(QuarterHour)
  hours: number;

  @Trim()
  @IsNotEmpty({ message: 'Enter the detail notes.' })
  @MinLength(3, { message: 'Detail notes must be 3 to 500 characters.' })
  @MaxLength(500, { message: 'Detail notes must be 3 to 500 characters.' })
  notes: string;

  /** Overrides the chamber default rate for this entry. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  chargeAgainstRetainer?: boolean;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  workedOn?: string;
}

export class BillableQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class DepositDto {
  @IsNumber({}, { message: 'Enter the deposit amount.' })
  @Min(1, { message: 'Deposit must be at least PKR 1.' })
  @Max(100_000_000, { message: 'Deposit is too large.' })
  @Validate(TwoDecimals)
  amount: number;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class CreateExpenseDto {
  @IsDateString({ strict: true }, { message: 'Enter a valid date.' })
  spentOn: string;

  @Trim()
  @IsNotEmpty({ message: 'Enter the expense category.' })
  @IsString()
  @MaxLength(60)
  category: string;

  @IsNumber({}, { message: 'Enter the amount.' })
  @Min(1, { message: 'Amount must be at least PKR 1.' })
  @Max(100_000_000)
  @Validate(TwoDecimals)
  amount: number;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateInternDto {
  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  firstName: string;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  lastName: string;

  @Trim()
  @IsNotEmpty()
  @Matches(CNIC_REGEX, { message: CNIC_MESSAGE })
  cnic: string;

  @TrimLower()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120)
  email: string;

  @Trim()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone: string;

  @IsDateString({ strict: true }, { message: 'Enter a valid start date.' })
  startDate: string;
}

export class InternStatusDto {
  @IsIn(['deactivate', 'reactivate'], { message: 'Action must be deactivate or reactivate.' })
  action: 'deactivate' | 'reactivate';
}

export class ResearchLogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  internId?: string;

  @IsOptional()
  @IsIn(['SUBMITTED', 'APPROVED', 'NEEDS_REVISION'])
  status?: 'SUBMITTED' | 'APPROVED' | 'NEEDS_REVISION';

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReviewLogDto {
  @IsIn(['APPROVED', 'NEEDS_REVISION'], { message: 'Choose approve or needs revision.' })
  status: 'APPROVED' | 'NEEDS_REVISION';

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export const INCOMPLETE_LOG_MESSAGE =
  'Incomplete log parameters. Please ensure citation fields are filled.';

export class ResearchLogDto {
  @Trim()
  @IsNotEmpty({ message: 'Enter the target case number.' })
  @IsString()
  @MaxLength(40)
  caseNumber: string;

  @Transform(trimList)
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one keyword.' })
  @ArrayMaxSize(15, { message: 'Add at most 15 keywords.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: 'Each keyword can be at most 40 characters.' })
  keywords: string[];

  @Trim()
  @IsNotEmpty({ message: INCOMPLETE_LOG_MESSAGE })
  @IsString({ message: INCOMPLETE_LOG_MESSAGE })
  @MaxLength(300)
  citation: string;

  @Trim()
  @IsNotEmpty({ message: INCOMPLETE_LOG_MESSAGE })
  @MinLength(50, { message: 'Relevant law notes must be 50 to 5000 characters.' })
  @MaxLength(5000, { message: 'Relevant law notes must be 50 to 5000 characters.' })
  notes: string;
}

export class CheckInDto {
  @IsNumber({}, { message: 'Location access is required to log attendance.' })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({}, { message: 'Location access is required to log attendance.' })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy: number;
}

export class AttendanceQueryDto {
  /** YYYY-MM */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Month must be like 2026-10.' })
  month?: string;
}
