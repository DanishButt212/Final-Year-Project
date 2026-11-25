import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { TranscriptsService } from './transcripts.service';

class AssignmentDto {
  @IsUUID()
  stenographerId: string;
}

class AssignmentQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

class DraftDto {
  @IsString()
  @MaxLength(60_000)
  text: string;

  @ValidateIf((dto: DraftDto) => dto.revision !== null)
  @IsInt()
  @Min(0)
  revision: number | null;
}

class RevisionDto {
  @IsInt()
  @Min(0)
  revision: number;
}

class CorrectionDto extends RevisionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  note: string;
}

class PdfQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  revision?: number;
}

class ListQuery {
  @IsOptional()
  @IsUUID()
  caseId?: string;
}

@Controller()
export class TranscriptsController {
  constructor(private readonly transcripts: TranscriptsService) {}

  @Roles('ADMIN')
  @Get('admin/transcript-assignments')
  assignments(@Query() query: AssignmentQuery) {
    return this.transcripts.assignments(query.search);
  }

  @Roles('ADMIN')
  @Patch('admin/transcript-assignments/:hearingId')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: AssignmentDto,
  ) {
    return this.transcripts.assign(user, id, dto.stenographerId);
  }

  @Roles('STENOGRAPHER', 'JUDGE', 'LAWYER')
  @Get('hearing-transcripts')
  list(@CurrentUser() user: AuthUser, @Query() query: ListQuery) {
    return this.transcripts.list(user, query.caseId);
  }

  @Roles('STENOGRAPHER', 'JUDGE', 'LAWYER')
  @Header('Cache-Control', 'private, no-store')
  @Get('hearing-transcripts/:hearingId/pdf')
  pdf(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Query() query: PdfQuery,
  ) {
    return this.transcripts.pdf(user, id, query.revision);
  }

  @Roles('STENOGRAPHER')
  @Put('hearing-transcripts/:hearingId/draft')
  save(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: DraftDto,
  ) {
    return this.transcripts.save(user, id, dto.text, dto.revision);
  }

  @Roles('STENOGRAPHER')
  @Post('hearing-transcripts/:hearingId/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.transcripts.submit(user, id, dto.revision);
  }

  @Roles('JUDGE')
  @Post('hearing-transcripts/:hearingId/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.transcripts.review(user, id, dto.revision);
  }

  @Roles('JUDGE')
  @Post('hearing-transcripts/:hearingId/return')
  returnForCorrection(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: CorrectionDto,
  ) {
    return this.transcripts.review(user, id, dto.revision, dto.note);
  }

  @Roles('JUDGE')
  @Post('hearing-transcripts/:hearingId/sign')
  sign(
    @CurrentUser() user: AuthUser,
    @Param('hearingId', ParseIdPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.transcripts.sign(user, id, dto.revision);
  }
}
