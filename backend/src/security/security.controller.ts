import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { AlertsQueryDto, BlacklistDto } from './security.dto';
import { SecurityService } from './security.service';

@ApiTags('admin-security')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('summary')
  summary() {
    return this.security.summary();
  }

  @Get('alerts')
  alerts(@Query() q: AlertsQueryDto) {
    return this.security.alerts(q.status);
  }

  @Get('alerts/:id')
  alert(@Param('id', ParseIdPipe) id: string) {
    return this.security.alertDetail(id);
  }

  /** "Blacklist Client Host Address". */
  @Post('alerts/:id/blacklist')
  blacklist(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: BlacklistDto,
    @Req() req: Request,
  ) {
    return this.security.blacklist(user, id, dto.reason, req.ip, this.meta(req));
  }

  @Post('alerts/:id/dismiss')
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.security.dismiss(user, id, this.meta(req));
  }

  @Get('blocked-hosts')
  blockedHosts() {
    return this.security.blockedHosts();
  }

  @Delete('blocked-hosts/:id')
  unblock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.security.unblock(user, id, this.meta(req));
  }

  @Get('events')
  events(@Query('limit') limit?: string) {
    return this.security.events(limit ? Number(limit) || 50 : 50);
  }
}
