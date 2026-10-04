import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimOrUndefined } from '../common/validators';

export class AlertsQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'DISMISSED', 'BLOCKED'])
  status?: 'OPEN' | 'DISMISSED' | 'BLOCKED';
}

export class BlacklistDto {
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
