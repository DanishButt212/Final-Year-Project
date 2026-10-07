import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { SessionCommandDto, SessionEventDto } from './virtual-courtroom.dto';
import { VirtualCourtroomService } from './virtual-courtroom.service';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** UC-4.1 and UC-4.2: ADMIN only. */
@ApiTags('virtual-courtroom')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminVirtualCourtroomController {
  constructor(private readonly courtroom: VirtualCourtroomService) {}

  @Post('hearings/:id/virtual-session/initialize')
  initialize(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.courtroom.initialize(user, id, meta(req));
  }

  @Get('virtual-sessions')
  list() {
    return this.courtroom.list();
  }

  @Get('virtual-sessions/:id')
  detail(@Param('id', ParseIdPipe) id: string) {
    return this.courtroom.detail(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('virtual-sessions/:id/command')
  command(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: SessionCommandDto,
    @Req() req: Request,
  ) {
    return this.courtroom.command(user, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('virtual-sessions/:id/end')
  end(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.courtroom.end(user, id, meta(req));
  }
}

/** UC-3.3 Access Virtual Courtroom Link: the case's filer and lawyers, its judge and admins. */
@ApiTags('virtual-courtroom')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('LITIGANT', 'LAWYER', 'JUDGE', 'ADMIN')
@Controller()
export class VirtualCourtroomController {
  constructor(private readonly courtroom: VirtualCourtroomService) {}

  @Get('hearings/:id/virtual-session/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.courtroom.status(user, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('hearings/:id/virtual-session/join')
  join(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.courtroom.join(user, id, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('sessions/:id/events')
  event(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: SessionEventDto,
  ) {
    return this.courtroom.event(user, id, dto);
  }

  @Get('sessions/:id/me')
  me(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.courtroom.me(user, id);
  }
}
