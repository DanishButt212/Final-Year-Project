import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators';

export class LoginDto {
  /** Email address (or username for admin accounts). */
  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  identifier: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(72)
  password: string;
}
