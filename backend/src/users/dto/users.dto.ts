import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/patterns';
import { Trim } from '../../common/validators';
import { Role, UserStatus } from '../../generated/prisma/client';

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
