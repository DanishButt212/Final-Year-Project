import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { UCN_REGEX } from '../cases/ucn';

export const UCN_FORMAT_MESSAGE = 'Enter a valid UCN, for example DA-2026-CIV-000001.';

export class CaseStatusQueryDto {
  @ApiProperty({ example: 'DA-2026-CIV-000001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: UCN_FORMAT_MESSAGE })
  @Matches(UCN_REGEX, { message: UCN_FORMAT_MESSAGE })
  ucn: string;
}
