import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { CNIC_MESSAGE, CNIC_REGEX, PHONE_MESSAGE, PHONE_REGEX } from '../common/patterns';
import { Trim, TrimOrUndefined } from '../common/validators';
import { NoticeType, SummonsPriority, SummonsStatus } from '../generated/prisma/client';

export const TELEMETRY_ERROR =
  'Telemetry Error: High-accuracy GPS coordinates required to commit log entries.';

export class IssueSummonsDto {
  @IsUUID()
  caseId: string;

  @IsEnum(NoticeType, { message: 'Notice type must be SUMMONS or NOTICE.' })
  noticeType: NoticeType;

  @Trim()
  @IsNotEmpty({ message: 'Enter the recipient name.' })
  @IsString()
  @MaxLength(120)
  recipientName: string;

  @TrimOrUndefined()
  @IsOptional()
  @Matches(CNIC_REGEX, { message: CNIC_MESSAGE })
  recipientCnic?: string;

  @Trim()
  @IsNotEmpty({ message: 'Enter the service address.' })
  @MinLength(10, { message: 'Enter the full service address (at least 10 characters).' })
  @MaxLength(300)
  serviceAddress: string;

  @Trim()
  @IsNotEmpty({ message: 'Enter the sector.' })
  @IsString()
  @MaxLength(80)
  sector: string;

  @IsEnum(SummonsPriority, { message: 'Priority must be URGENT or NORMAL.' })
  priority: SummonsPriority;

  /** YYYY-MM-DD, today or later. Defaults from the policy summons_default_due_days. */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Enter a valid due date.' })
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  assignedServerId?: string;

  @IsOptional()
  @IsUUID()
  partyId?: string;
}

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class SummonsListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(SummonsStatus)
  status?: SummonsStatus;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsUUID()
  courtId?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sector?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class AssignDto {
  @IsUUID()
  serverId: string;
}

export class CancelDto {
  @Trim()
  @IsNotEmpty({ message: 'Please enter the reason for cancelling.' })
  @MinLength(5, { message: 'The reason must be 5 to 300 characters.' })
  @MaxLength(300, { message: 'The reason must be 5 to 300 characters.' })
  reason: string;
}

export class ServerListQueryDto {
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sector?: string;
}

/** Telemetry and notes arrive as numbers (JSON) or strings (multipart); they are parsed in the service. */
export class AttemptDto {
  @IsOptional()
  latitude?: number | string;

  @IsOptional()
  longitude?: number | string;

  @IsOptional()
  accuracyM?: number | string;

  @Trim()
  @IsNotEmpty({ message: 'Enter your field observation notes (5 to 500 characters).' })
  @MinLength(5, { message: 'Field observation notes must be 5 to 500 characters.' })
  @MaxLength(500, { message: 'Field observation notes must be 5 to 500 characters.' })
  notes: string;
}

export class FinalizeDto extends AttemptDto {
  @IsIn(['PERSONAL_DELIVERY', 'REFUSED_AFFIXED'], {
    message: 'Service mode must be PERSONAL_DELIVERY or REFUSED_AFFIXED.',
  })
  serviceMode: 'PERSONAL_DELIVERY' | 'REFUSED_AFFIXED';
}

export class UpdateServerProfileDto {
  @TrimOrUndefined()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;
}
