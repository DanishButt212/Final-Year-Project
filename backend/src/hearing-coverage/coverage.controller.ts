import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Trim } from '../common/validators';
import { CoverageService } from './coverage.service';


class ClashDto {
  @IsUUID() hearingId: string;
  @Trim() @IsString() @IsNotEmpty() @MaxLength(2000) reason: string;
  @IsOptional() @IsUUID() chamberId?: string;
}
const actions = [
  'NOMINATE',
  'ALLOCATE',
  'ACCEPT',
  'DECLINE',
  'READER_APPROVE',
  'READER_REJECT',
  'JUDGE_APPROVE',
  'JUDGE_REJECT',
] as const;
class ActionDto {
  @IsIn(actions) action: (typeof actions)[number];
  @IsOptional() @IsUUID() candidateId?: string;
  @Trim() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
class CandidateQuery {
  @Trim() @IsOptional() @IsString() @MaxLength(80) search?: string;
}
class FlagDto {
  @IsBoolean() lastSummons: boolean;
}
class MemberDto {
  @Trim() @IsString() @IsNotEmpty() @MaxLength(40) barNumber: string;
}
class AbsenceDto {
  @IsUUID() hearingId: string;
  @IsUUID() lawyerId: string;
  @Trim() @IsString() @MaxLength(2000) reason: string;
}
class FineDecisionDto {
  @IsBoolean() fineRequired: boolean;
}
class AbsenceQuery {
  @IsOptional() @IsUUID() hearingId?: string;
  @IsOptional() @IsUUID() caseId?: string;
}
class FineDto {
  @Matches(/^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/)
  amount: string;
}

@Controller('hearing-coverage')
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Roles('ADMIN', 'JUDGE', 'LAWYER')
  @Get()
  dashboard(@CurrentUser() user: AuthUser) {
    return this.coverage.dashboard(user, false);
  }

  @Roles('LAWYER')
  @Get('chamber')
  chamber(@CurrentUser() user: AuthUser) {
    return this.coverage.dashboard(user, true);
  }

  @Roles('LAWYER')
  @HttpCode(204)
  @Post('chamber/members')
  member(@CurrentUser() user: AuthUser, @Body() dto: MemberDto) {
    return this.coverage.member(user, dto.barNumber);
  }

  @Roles('ADMIN', 'JUDGE', 'LAWYER')
  @Get('hearings/:id')
  context(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.coverage.context(user, id);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Patch('hearings/:id/last-summons')
  mark(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: FlagDto) {
    return this.coverage.lastSummons(user, id, dto.lastSummons);
  }

  @Roles('LAWYER')
  @Post()
  report(@CurrentUser() user: AuthUser, @Body() dto: ClashDto) {
    return this.coverage.report(user, dto.hearingId, dto.reason, dto.chamberId);
  }

  @Roles('LAWYER')
  @Get('requests/:id/candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Query() q: CandidateQuery,
  ) {
    return this.coverage.candidates(user, id, q.search ?? '');
  }

  @Roles('ADMIN', 'JUDGE', 'LAWYER')
  @HttpCode(204)
  @Post('requests/:id/actions')
  act(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: ActionDto) {
    return this.coverage.act(user, id, dto.action, dto.candidateId, dto.note);
  }

  @Roles('ADMIN', 'JUDGE')
  @Get('absences')
  absences(@CurrentUser() user: AuthUser, @Query() q: AbsenceQuery) {
    return this.coverage.absences(user, q.hearingId, q.caseId);
  }

  @Roles('JUDGE')
  @HttpCode(204)
  @Post('absences')
  absence(@CurrentUser() user: AuthUser, @Body() dto: AbsenceDto) {
    return this.coverage.absence(user, dto.hearingId, dto.lawyerId, dto.reason);
  }

  @Roles('JUDGE')
  @HttpCode(204)
  @Post('absences/:id/decision')
  decideFine(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: FineDecisionDto) {
    return this.coverage.decideFine(user, id, dto.fineRequired);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Post('absences/:id/fine')
  fine(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: FineDto) {
    return this.coverage.fine(user, id, dto.amount);
  }
}
