import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../common/validators';
import { DeliveryOutcome } from '../generated/prisma/client';

export class AssignDeliveryDto {
  @IsUUID()
  documentId: string;

  @IsUUID()
  recipientId: string;

  @IsUUID()
  serverId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  address: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;
}

export class DeliveryVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version: number;
}

export class ReportDeliveryDto extends DeliveryVersionDto {
  @IsEnum(DeliveryOutcome)
  outcome: DeliveryOutcome;

  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  occurredAt: string;

  @Trim()
  @IsString()
  @MaxLength(3000)
  remarks: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  receivedBy?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ReplyDeliveryDto extends DeliveryVersionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  note: string;
}

export class ReviewDeliveryDto extends DeliveryVersionDto {
  @IsIn(['ACCEPT', 'REQUEST_CLARIFICATION', 'RETRY', 'FORWARD'])
  action: 'ACCEPT' | 'REQUEST_CLARIFICATION' | 'RETRY' | 'FORWARD';

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  address?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;
}
