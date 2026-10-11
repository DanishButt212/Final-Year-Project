import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** Aggregates for the caller's dashboard charts, scoped to the cases they may open (cached 60 s). */
  @Roles('LITIGANT', 'LAWYER', 'JUDGE', 'ADMIN')
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.insights.forUser(user);
  }
}
