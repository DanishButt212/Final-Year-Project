import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { CaseStatusQueryDto } from './public-status.dto';
import { PublicStatusService } from './public-status.service';

/** 10 lookups per minute per client (PUBLIC_STATUS_THROTTLE_LIMIT), on top of the global limits. */
const statusThrottle = () => ({
  default: {
    limit: () => Number(process.env.PUBLIC_STATUS_THROTTLE_LIMIT ?? 10),
    ttl: () => 60_000,
  },
});

@ApiTags('public')
@Controller('public')
export class PublicStatusController {
  constructor(private readonly status: PublicStatusService) {}

  /** Public case status by UCN: stage, stage dates and the next hearing. No personal data. */
  @Public()
  @Throttle(statusThrottle())
  @Get('cases/status')
  caseStatus(@Query() query: CaseStatusQueryDto, @Req() req: Request) {
    return this.status.lookup(query.ucn, req.ip);
  }
}
