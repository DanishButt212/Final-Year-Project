import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CNIC_MESSAGE, CNIC_REGEX, PHONE_MESSAGE, PHONE_REGEX } from '../../common/patterns';
import { PageQueryDto } from '../../common/pagination';
import { Trim, TrimLower, TrimOrUndefined } from '../../common/validators';
import { CaseStatus, CaseType, Role, UserStatus } from '../../generated/prisma/client';

export const PROVISIONABLE_ROLES = ['INTERN', 'PROCESS_SERVER', 'JUDGE', 'ADMIN'] as const;
export type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID()
  courtId?: string;
}

export class AdminListUsersQueryDto extends PageQueryDto {
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateStaffDto {
  @IsNotEmpty()
  @IsIn(PROVISIONABLE_ROLES, { message: 'Role must be INTERN, PROCESS_SERVER, JUDGE or ADMIN.' })
  role: ProvisionableRole;

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

  /** Required for judges. */
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @IsOptional()
  @IsUUID()
  courtroomId?: string;

  /** Required for interns: the verified lawyer (LawyerProfile id) who supervises them. */
  @IsOptional()
  @IsUUID()
  supervisorLawyerId?: string;
}

export const STATUS_ACTIONS = ['suspend', 'block', 'reactivate', 'delete'] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

export class UpdateUserStatusDto {
  @IsNotEmpty()
  @IsIn(STATUS_ACTIONS, { message: 'Action must be suspend, block, reactivate or delete.' })
  action: StatusAction;
}

export class ListLawyersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'VERIFIED', 'REJECTED'])
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' = 'PENDING';

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class RejectLawyerDto {
  @Trim()
  @IsNotEmpty({ message: 'Please enter a reason for rejection.' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class CreateCourtroomDto {
  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  benchNo?: number;

  @IsUUID()
  courtId: string;
}

export class UpdateCourtroomDto {
  @Trim()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  benchNo?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminListCasesQueryDto extends PageQueryDto {
  /** Matches the UCN or the title. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsUUID()
  courtId?: string;

  @IsOptional()
  @IsEnum(CaseType)
  caseType?: CaseType;

  /** Filing date range, ISO dates (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class AllocateCaseDto {
  @IsIn(['MANUAL', 'RANDOM'])
  mode: 'MANUAL' | 'RANDOM';

  @IsUUID()
  courtId: string;

  @IsOptional()
  @IsUUID()
  courtroomId?: string;

  @IsOptional()
  @IsUUID()
  judgeId?: string;

  /** Must be true to move an already allocated case to another judge. */
  @IsOptional()
  @IsBoolean()
  reallocate?: boolean;
}

export class UpdateCourtGeofenceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Latitude must be a number.' })
  @Min(-90, { message: 'Latitude must be between -90 and 90.' })
  @Max(90, { message: 'Latitude must be between -90 and 90.' })
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Longitude must be a number.' })
  @Min(-180, { message: 'Longitude must be between -180 and 180.' })
  @Max(180, { message: 'Longitude must be between -180 and 180.' })
  longitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Radius must be a whole number of metres.' })
  @Min(50, { message: 'Radius must be between 50 and 5000 metres.' })
  @Max(5000, { message: 'Radius must be between 50 and 5000 metres.' })
  geofenceRadiusM?: number | null;
}
