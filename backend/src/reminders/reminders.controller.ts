import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { REMINDERS_SENT_MESSAGE, RemindersService } from './reminders.service';

@ApiTags('admin')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /** Runs the daily hearing reminder job now (demo). Idempotent: reminders already sent are not repeated. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.reminders.run(user, 'manual', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { message: REMINDERS_SENT_MESSAGE, ...result };
  }
}
