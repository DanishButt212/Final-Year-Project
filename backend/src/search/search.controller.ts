import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/decorators';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';

/** 60 searches per minute per client (the palette debounces typing). */
const searchThrottle = () => ({
  default: { limit: () => Number(process.env.SEARCH_THROTTLE_LIMIT ?? 60), ttl: () => 60_000 },
});

@ApiTags('search')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** Cases the caller may open, matching the UCN, a party name or the title (at most 8). */
  @Throttle(searchThrottle())
  @Get()
  search(@CurrentUser() user: AuthUser, @Query() query: SearchQueryDto) {
    return this.searchService.search(user, query.q);
  }
}
