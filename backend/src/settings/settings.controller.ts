import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Only what the frontend needs: attachment limit and whether filing is open. */
  @Public()
  @Get('settings/public')
  publicSettings() {
    return this.settings.publicSettings();
  }

  @ApiCookieAuth()
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/settings')
  getAll() {
    return this.settings.getAll();
  }

  /** UC-2.3: "Apply Policy Changes System-Wide". */
  @ApiCookieAuth()
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Put('admin/settings')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto, @Req() req: Request) {
    return this.settings.update(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
