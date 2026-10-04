import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CNIC_MESSAGE, CNIC_REGEX, PHONE_MESSAGE, PHONE_REGEX } from '../../common/patterns';
import { Trim, TrimOrUndefined } from '../../common/validators';
import { CaseStatus, CaseType } from '../../generated/prisma/client';

export class PartyDto {
  @Trim()
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name: string;

  /** Optional. Format 12345-1234567-1. */
  @TrimOrUndefined()
  @IsOptional()
  @Matches(CNIC_REGEX, { message: CNIC_MESSAGE })
  cnic?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  /** Optional. Format +92 3XX XXXXXXX. */
  @TrimOrUndefined()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;
}

/** The JSON document sent in the `data` field of the multipart request. */
export class CreateCaseDto {
  @IsNotEmpty()
  @IsEnum(CaseType)
  caseType: CaseType;

  /** Optional. When empty the title becomes "<Petitioner> vs. <Respondent>". */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @MinLength(20, { message: 'Relief sought must be at least 20 characters.' })
  @MaxLength(5000)
  reliefSought: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one petitioner.' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  petitioners: PartyDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one respondent.' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  respondents: PartyDto[];
}

export class ListCasesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  /** Matches the UCN or the title. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(CaseStatus))
  status?: CaseStatus;
}
