import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../common/validators';
import { EvidenceCategory } from '../generated/prisma/client';

const DESCRIPTION_MESSAGE = 'Enter a description of 10 to 500 characters.';

/** The text fields sent next to the files in the multipart upload. */
export class UploadEvidenceDto {
  @IsEnum(EvidenceCategory, { message: 'Choose Video, Audio or Scanned Records Document.' })
  category: EvidenceCategory;

  @Trim()
  @IsNotEmpty({ message: DESCRIPTION_MESSAGE })
  @IsString()
  @MinLength(10, { message: DESCRIPTION_MESSAGE })
  @MaxLength(500, { message: DESCRIPTION_MESSAGE })
  description: string;
}

export class UpdateEvidenceDto {
  @Trim()
  @IsNotEmpty({ message: DESCRIPTION_MESSAGE })
  @IsString()
  @MinLength(10, { message: DESCRIPTION_MESSAGE })
  @MaxLength(500, { message: DESCRIPTION_MESSAGE })
  description: string;
}

export class LockEvidenceDto {
  /** Empty or missing means every exhibit of the case. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  evidenceIds?: string[];

  @Trim()
  @IsNotEmpty({ message: 'Please enter the reason for the order.' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
