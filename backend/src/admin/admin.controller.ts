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
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CasesService } from '../cases/cases.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { AdminCasesService } from './admin-cases.service';
import { AdminCourtsService } from './admin-courts.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminLawyersService } from './admin-lawyers.service';
import { AdminUsersService } from './admin-users.service';
import { RequestMeta } from './constants';
import {
  AdminListCasesQueryDto,
  AdminListUsersQueryDto,
  AllocateCaseDto,
  CreateCourtroomDto,
  UpdateCourtGeofenceDto,
  CreateStaffDto,
  DashboardQueryDto,
  ListLawyersQueryDto,
  RejectLawyerDto,
  UpdateCourtroomDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** Every /admin route is ADMIN-only; every mutation writes an audit entry. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly users: AdminUsersService,
    private readonly lawyers: AdminLawyersService,
    private readonly courts: AdminCourtsService,
    private readonly cases: AdminCasesService,
    private readonly caseFiles: CasesService,
  ) {}

  // UC-1.3
  @Get('dashboard/stats')
  stats(@Query() q: DashboardQueryDto) {
    return this.dashboard.stats(q.courtId);
  }

  // UC-2.1
  @Get('users')
  listUsers(@Query() q: AdminListUsersQueryDto) {
    return this.users.list(q);
  }

  @Post('users')
  provision(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto, @Req() req: Request) {
    return this.users.provision(user, dto, meta(req));
  }

  @Patch('users/:id/status')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(user, id, dto, meta(req));
  }

  // UC-2.2
  @Get('lawyers')
  listLawyers(@Query() q: ListLawyersQueryDto) {
    return this.lawyers.list(q);
  }

  @HttpCode(HttpStatus.OK)
  @Post('lawyers/:id/bar-check')
  barCheck(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.lawyers.barCheck(user, id, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('lawyers/:id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.lawyers.verify(user, id, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('lawyers/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: RejectLawyerDto,
    @Req() req: Request,
  ) {
    return this.lawyers.reject(user, id, dto.reason, meta(req));
  }

  // Courts and benches
  @Get('courts')
  listCourts() {
    return this.courts.list();
  }

  @Patch('courts/:id')
  updateGeofence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateCourtGeofenceDto,
    @Req() req: Request,
  ) {
    return this.courts.updateGeofence(user, id, dto, meta(req));
  }

  @Post('courtrooms')
  createCourtroom(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCourtroomDto,
    @Req() req: Request,
  ) {
    return this.courts.createCourtroom(user, dto, meta(req));
  }

  @Patch('courtrooms/:id')
  updateCourtroom(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateCourtroomDto,
    @Req() req: Request,
  ) {
    return this.courts.updateCourtroom(user, id, dto, meta(req));
  }

  // Case registry and allocation
  @Get('cases')
  listCases(@Query() q: AdminListCasesQueryDto) {
    return this.cases.list(q);
  }

  @Get('cases/:id')
  caseDetail(@Param('id', ParseIdPipe) id: string) {
    return this.cases.detail(id);
  }

  @Get('cases/:id/documents/:docId/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('docId', ParseIdPipe) docId: string,
    @Req() req: Request,
  ) {
    return this.caseFiles.download(user, id, docId, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('cases/:id/allocate')
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: AllocateCaseDto,
    @Req() req: Request,
  ) {
    return this.cases.allocate(user, id, dto, meta(req));
  }
}
