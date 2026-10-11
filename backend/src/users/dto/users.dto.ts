import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/patterns';
import { Trim } from '../../common/validators';
import { Role, UiLanguage, UserStatus } from '../../generated/prisma/client';

/** Root text-size steps offered by the interface (100 %, 112.5 %, 125 %). */
export const FONT_SCALES = [1, 1.125, 1.25] as const;

export class UpdateProfileDto {
  /** Phone in the format +92 3XX XXXXXXX. */
  @IsOptional()
  @Trim()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  /** https URL or an /uploads/... path. Send null to remove the picture. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/\S+|\/uploads\/[\w\-./]+)$/, {
    message: 'Profile image must be a link or an uploaded file path.',
  })
  profileImage?: string | null;

  /** Interface language: en or ur. */
  @IsOptional()
  @IsEnum(UiLanguage, { message: 'Language must be en or ur.' })
  preferredLanguage?: UiLanguage;

  /** Root text size: 1, 1.125 or 1.25. */
  @IsOptional()
  @IsIn(FONT_SCALES, { message: 'Text size must be 1, 1.125 or 1.25.' })
  fontScale?: number;
}

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** Matches name, email, CNIC. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** UC-5.3 Set Notification Channels. In-app notifications are always on. */
export class NotificationPreferencesDto {
  @IsBoolean()
  sms: boolean;

  @IsBoolean()
  mobilePush: boolean;

  @IsBoolean()
  email: boolean;
}
