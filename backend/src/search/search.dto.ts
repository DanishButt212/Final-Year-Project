import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  /** UCN (or its beginning) or part of a party name or case title. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Enter at least 2 characters to search.' })
  @MinLength(2, { message: 'Enter at least 2 characters to search.' })
  @MaxLength(64, { message: 'Use 64 characters or fewer.' })
  q: string;
}
