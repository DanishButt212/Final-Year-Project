import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CNIC_MESSAGE,
  CNIC_REGEX,
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
  PHONE_MESSAGE,
  PHONE_REGEX,
} from '../../common/patterns';
import { Match, Trim, TrimLower } from '../../common/validators';

export const SELF_REGISTER_ROLES = ['LITIGANT', 'LAWYER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export class RegisterDto {
  /** Account type chosen on the registration form. */
  @IsNotEmpty()
  @IsIn(SELF_REGISTER_ROLES, { message: 'Role must be LITIGANT or LAWYER.' })
  role: SelfRegisterRole;

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

  /** CNIC in the format 12345-1234567-1. */
  @Trim()
  @IsNotEmpty()
  @Matches(CNIC_REGEX, { message: CNIC_MESSAGE })
  cnic: string;

  @TrimLower()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120)
  email: string;

  /** Phone in the format +92 3XX XXXXXXX. */
  @Trim()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @IsNotEmpty()
  @Match('password', { message: 'Passwords do not match.' })
  confirmPassword: string;

  /** Bar Council number (lawyers only, optional). */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9/-]+$/, { message: 'Bar number may contain letters, digits, - and /.' })
  barNumber?: string;
}
