import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { CaseType } from '../generated/prisma/client';

/** Filters of the "Judicial Performance & Statistical Engine". */
export class PerformanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a valid target year.' })
  @Min(2000, { message: 'Choose a valid target year.' })
  @Max(2100, { message: 'Choose a valid target year.' })
  year: number = new Date().getUTCFullYear();

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a month between 1 and 12.' })
  @Min(1, { message: 'Choose a month between 1 and 12.' })
  @Max(12, { message: 'Choose a month between 1 and 12.' })
  monthFrom: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a month between 1 and 12.' })
  @Min(1, { message: 'Choose a month between 1 and 12.' })
  @Max(12, { message: 'Choose a month between 1 and 12.' })
  monthTo: number = 12;

  @IsOptional()
  @IsEnum(CaseType, { message: 'Choose a valid case category.' })
  caseType?: CaseType;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid judge bench.' })
  judgeId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid court.' })
  courtId?: string;
}

export class ExportReportDto {
  @IsIn(['PERFORMANCE', 'AUDIT_TRAIL'], { message: 'Choose a report type.' })
  kind!: 'PERFORMANCE' | 'AUDIT_TRAIL';

  @IsIn(['PDF', 'EXCEL'], { message: 'Choose PDF or Excel.' })
  format!: 'PDF' | 'EXCEL';

  @IsObject()
  params!: Record<string, unknown>;
}

export class HistoryQueryDto extends PageQueryDto {}
