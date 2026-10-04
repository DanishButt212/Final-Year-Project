import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { SummonsAdminService } from './summons-admin.service';
import { SummonsCaseService } from './summons-case.service';
import {
  AssignDto,
  AttemptDto,
  CancelDto,
  FinalizeDto,
  IssueSummonsDto,
  ServerListQueryDto,
  SummonsListQueryDto,
  UpdateServerProfileDto,
} from './summons.dto';
import { FinalizeUploadInterceptor, ProfileUploadInterceptor } from './summons.files';
import { CurrentServer, ServerContext, ServerGuard, ServerService } from './server.service';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const kindOf = (k: string) => (k === 'signature' ? 'signature' : 'photo');

/** Registry admin: issue, assign, reassign and cancel summons; inspect the proof. */
@ApiTags('summons-admin')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminSummonsController {
  constructor(private readonly summons: SummonsAdminService) {}

  @Post('summons')
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueSummonsDto, @Req() req: Request) {
    return this.summons.issue(user, dto, meta(req));
  }

  @Get('summons')
  list(@Query() q: SummonsListQueryDto) {
    return this.summons.list(q);
  }

  @Get('summons/:id')
  detail(@Param('id', ParseIdPipe) id: string) {
    return this.summons.detail(id);
  }

  @Patch('summons/:id/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: AssignDto,
    @Req() req: Request,
  ) {
    return this.summons.assign(user, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('summons/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CancelDto,
    @Req() req: Request,
  ) {
    return this.summons.cancel(user, id, dto, meta(req));
  }

  @Get('summons/:id/proof/:kind')
  proof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('kind') kind: string,
    @Req() req: Request,
  ) {
    return this.summons.proofFile(user, id, kindOf(kind), meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('summons/:id/verify-seal')
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.summons.verifySeal(user, id, meta(req));
  }

  @Get('process-servers')
  servers(@Query() q: ServerListQueryDto) {
    return this.summons.servers(q);
  }

  @Get('cases/:id/summons-parties')
  parties(@Param('id', ParseIdPipe) id: string) {
    return this.summons.caseParties(id);
  }
}

/** Case side: read-only for the parties, the judge and admins. */
@ApiTags('summons')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('LITIGANT', 'LAWYER', 'JUDGE', 'ADMIN')
@Controller()
export class CaseSummonsController {
  constructor(
    private readonly cases: SummonsCaseService,
    private readonly admin: SummonsAdminService,
  ) {}

  @Get('cases/:id/summons')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.cases.list(user, id);
  }

  @Get('summons/:id/proof.pdf')
  pdf(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.cases.proofPdf(user, id, meta(req));
  }

  @Roles('JUDGE', 'ADMIN')
  @Get('summons/:id/proof/:kind')
  proof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('kind') kind: string,
    @Req() req: Request,
  ) {
    return this.admin.proofFile(user, id, kindOf(kind), meta(req));
  }
}

/** Process server console API. JSON and multipart only, so the later mobile app can reuse it with a Bearer token. */
@ApiTags('server')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('PROCESS_SERVER')
@UseGuards(ServerGuard)
@Controller('server')
export class ServerController {
  constructor(private readonly server: ServerService) {}

  @Get('roster')
  roster(@CurrentServer() s: ServerContext) {
    return this.server.roster(s);
  }

  @Get('summary')
  summary(@CurrentServer() s: ServerContext) {
    return this.server.summary(s);
  }

  @Get('summons/:id')
  detail(@CurrentServer() s: ServerContext, @Param('id', ParseIdPipe) id: string) {
    return this.server.detail(s, id);
  }

  @Post('summons/:id/attempts')
  attempt(
    @CurrentServer() s: ServerContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: AttemptDto,
    @Req() req: Request,
  ) {
    return this.server.attempt(s, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FinalizeUploadInterceptor)
  @Post('summons/:id/finalize')
  finalize(
    @CurrentServer() s: ServerContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: FinalizeDto,
    @Req() req: Request,
  ) {
    return this.server.finalize(s, id, dto, req, meta(req));
  }

  @Get('profile')
  profile(@CurrentServer() s: ServerContext) {
    return this.server.profile(s);
  }

  @Get('profile/photo')
  photo(@CurrentServer() s: ServerContext) {
    return this.server.profilePhoto(s);
  }

  @UseInterceptors(ProfileUploadInterceptor)
  @Patch('profile')
  updateProfile(
    @CurrentServer() s: ServerContext,
    @Body() dto: UpdateServerProfileDto,
    @Req() req: Request,
  ) {
    return this.server.updateProfile(s, dto, req, meta(req));
  }
}
