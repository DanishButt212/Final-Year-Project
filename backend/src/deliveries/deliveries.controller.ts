import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { DeliveryAcknowledgmentInterceptor, uploaded } from '../summons/summons.files';
import { ServerGuard } from '../summons/server.service';
import {
  AssignDeliveryDto,
  DeliveryVersionDto,
  ReplyDeliveryDto,
  ReportDeliveryDto,
  ReviewDeliveryDto,
} from './deliveries.dto';
import { DeliveriesService } from './deliveries.service';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@Roles('ADMIN')
@Controller('admin')
export class AdminDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('cases/:caseId/deliveries')
  list(@CurrentUser() user: AuthUser, @Param('caseId', ParseIdPipe) caseId: string) {
    return this.deliveries.list(user, caseId);
  }

  @Get('cases/:caseId/delivery-options')
  options(@Param('caseId', ParseIdPipe) caseId: string) {
    return this.deliveries.options(caseId);
  }

  @Post('cases/:caseId/deliveries')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseIdPipe) caseId: string,
    @Body() dto: AssignDeliveryDto,
    @Req() req: Request,
  ) {
    return this.deliveries.assign(user, caseId, dto, meta(req));
  }

  @HttpCode(204)
  @Post('deliveries/:id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ReviewDeliveryDto,
    @Req() req: Request,
  ) {
    return this.deliveries.review(user, id, dto, meta(req));
  }
}

@Roles('PROCESS_SERVER')
@UseGuards(ServerGuard)
@Controller('server/deliveries')
export class ServerDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.deliveries.list(user);
  }

  @HttpCode(204)
  @Post(':id/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: DeliveryVersionDto,
    @Req() req: Request,
  ) {
    return this.deliveries.start(user, id, dto.version, meta(req));
  }

  @HttpCode(204)
  @UseInterceptors(DeliveryAcknowledgmentInterceptor)
  @Post(':id/report')
  report(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ReportDeliveryDto,
    @Req() req: Request,
  ) {
    return this.deliveries.report(user, id, dto, uploaded(req, 'acknowledgment'), meta(req));
  }

  @HttpCode(204)
  @Post(':id/clarification')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ReplyDeliveryDto,
    @Req() req: Request,
  ) {
    return this.deliveries.reply(user, id, dto.version, dto.note, meta(req));
  }

  @Header('Cache-Control', 'private, no-store')
  @Get(':id/document')
  document(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.deliveries.document(user, id, meta(req));
  }

  @Header('Cache-Control', 'private, no-store')
  @Get(':id/attempts/:attemptId/acknowledgment')
  acknowledgment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('attemptId', ParseIdPipe) attemptId: string,
    @Req() req: Request,
  ) {
    return this.deliveries.acknowledgment(user, id, attemptId, meta(req));
  }
}

@Roles('JUDGE', 'ADMIN')
@Controller()
export class DeliveryFilesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Roles('JUDGE')
  @Get('judge/cases/:caseId/deliveries')
  judged(@CurrentUser() user: AuthUser, @Param('caseId', ParseIdPipe) caseId: string) {
    return this.deliveries.list(user, caseId);
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('deliveries/:id/document')
  document(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.deliveries.document(user, id, meta(req));
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('deliveries/:id/attempts/:attemptId/acknowledgment')
  acknowledgment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('attemptId', ParseIdPipe) attemptId: string,
    @Req() req: Request,
  ) {
    return this.deliveries.acknowledgment(user, id, attemptId, meta(req));
  }
}
