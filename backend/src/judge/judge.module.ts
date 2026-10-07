import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { fullName, personName } from '../admin/constants';
import { CasesModule } from '../cases/cases.module';
import { CasesService } from '../cases/cases.service';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { TrimOrUndefined } from '../common/validators';
import { Prisma } from '../generated/prisma/client';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { DecideCaseDto, HearingOutcomeDto, JudgeDecisionsService } from './judge-decisions.service';
import { JudgeOrdersQueryDto, JudgeOrdersService } from './judge-orders.service';
import { PrismaService } from '../prisma/prisma.service';

export class JudgeCasesQueryDto extends PageQueryDto {
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

@Injectable()
export class JudgeService {
  constructor(private readonly prisma: PrismaService) {}

  async myCases(judge: AuthUser, q: JudgeCasesQueryDto) {
    const where: Prisma.CaseWhereInput = {
      judgeId: judge.id,
      ...(q.search
        ? {
            OR: [
              { ucn: { contains: q.search, mode: 'insensitive' } },
              { title: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.case.count({ where }),
      this.prisma.case.findMany({
        where,
        select: {
          id: true,
          ucn: true,
          title: true,
          caseType: true,
          status: true,
          filingDate: true,
          courtroom: { select: { name: true } },
          filedBy: personName,
        },
        orderBy: [{ allocatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      data: rows.map((c) => ({
        id: c.id,
        ucn: c.ucn,
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        filingDate: c.filingDate,
        courtroom: c.courtroom?.name ?? null,
        filedBy: fullName(c.filedBy),
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }
}

@ApiTags('judge')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('JUDGE')
@Controller('judge')
export class JudgeController {
  constructor(
    private readonly judge: JudgeService,
    private readonly caseService: CasesService,
    private readonly decisions: JudgeDecisionsService,
    private readonly orders: JudgeOrdersService,
  ) {}

  /** Orders and decisions recorded on the judge's own cases (hearing outcomes and final decisions). */
  @Get('orders')
  listOrders(@CurrentUser() user: AuthUser, @Query() q: JudgeOrdersQueryDto) {
    return this.orders.list(user, q);
  }

  /** Record the outcome of a hearing dated today or earlier. */
  @Post('hearings/:id/outcome')
  outcome(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: HearingOutcomeDto,
    @Req() req: Request,
  ) {
    return this.decisions.recordOutcome(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Decide the case: final order, immutable afterwards. */
  @Post('cases/:id/decide')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: DecideCaseDto,
    @Req() req: Request,
  ) {
    return this.decisions.decide(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Read-only case detail for the judge the case is allocated to (anyone else gets 404). */
  @Get('cases/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.caseService.detail(user, id);
  }

  /** Cases allocated to the logged-in judge. */
  @Get('cases')
  cases(@CurrentUser() user: AuthUser, @Query() q: JudgeCasesQueryDto) {
    return this.judge.myCases(user, q);
  }
}

@Module({
  imports: [CasesModule, SchedulingModule],
  controllers: [JudgeController],
  providers: [JudgeService, JudgeDecisionsService, JudgeOrdersService],
})
export class JudgeModule {}
