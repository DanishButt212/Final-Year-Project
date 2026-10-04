import { Body, Controller, Get, Patch, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ListUsersQueryDto, NotificationPreferencesDto, UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Current user's profile. */
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  /** Edit phone and/or profile image. */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @Req() req: Request) {
    return this.users.updateMe(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Get('me/notification-preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.users.getPreferences(user.id);
  }

  /** "Notification Preferences Saved." */
  @Put('me/notification-preferences')
  savePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: NotificationPreferencesDto,
    @Req() req: Request,
  ) {
    return this.users.savePreferences(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Paginated user list. ADMIN only. */
  @Roles('ADMIN')
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }
}
