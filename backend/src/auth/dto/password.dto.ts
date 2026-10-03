import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../common/patterns';
import { Match, Trim, TrimLower } from '../../common/validators';

export class ForgotPasswordDto {
  @TrimLower()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120)
  email: string;
}

export class ResetPasswordDto {
  /** The token from the reset link. */
  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  token: string;

  @IsNotEmpty()
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @IsNotEmpty()
  @Match('password', { message: 'Passwords do not match.' })
  confirmPassword: string;
}
