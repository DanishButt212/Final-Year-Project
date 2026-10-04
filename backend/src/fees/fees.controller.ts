import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PageQueryDto } from '../common/pagination';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ChallansService } from './challans.service';
import { AuthorizeDto, CheckoutDto } from './fees.dto';
import { PaymentsService } from './payments.service';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** UC-4.1 to UC-4.3: litigants and lawyers, own cases only (anyone else gets 404). */
@ApiTags('fees')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('LITIGANT', 'LAWYER')
@Controller()
export class FeesController {
  constructor(
    private readonly challans: ChallansService,
    private readonly payments: PaymentsService,
  ) {}

  /** "Calculate Costs and Fees": idempotent, one active challan per case. */
  @HttpCode(HttpStatus.OK)
  @Post('cases/:id/challan')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.challans.generate(user, id, meta(req));
  }

  @Get('cases/:id/challan')
  challan(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.challans.get(user, id);
  }

  @Get('challans/:id/pdf')
  challanPdf(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.challans.pdf(user, id);
  }

  /** "Pay Fee Online": opens a pending payment and routes to the demo gateway. */
  @HttpCode(HttpStatus.OK)
  @Post('payments/checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.payments.checkout(user, dto);
  }

  @Get('payments/mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: PageQueryDto) {
    return this.payments.mine(user, q);
  }

  @Get('payments/:id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.payments.receipt(user, id);
  }

  /** SIMULATED gateway. Card details are processed in memory only. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mock-gateway/authorize')
  authorize(@CurrentUser() user: AuthUser, @Body() dto: AuthorizeDto, @Req() req: Request) {
    return this.payments.authorize(user, dto, meta(req));
  }
}
