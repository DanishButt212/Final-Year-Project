import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { Roles } from '../common/decorators';
import { PageQueryDto } from '../common/pagination';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { CertificateService } from './certificate.service';
import { ChamberInternsService } from './chamber-interns.service';
import {
  BillableQueryDto,
  CheckInDto,
  ClientListQueryDto,
  CreateBillableDto,
  CreateClientDto,
  CreateExpenseDto,
  CreateInternDto,
  DepositDto,
  InternStatusDto,
  ResearchLogDto,
  ResearchLogQueryDto,
  ReviewLogDto,
  AttendanceQueryDto,
  UpdateChamberProfileDto,
  UpdateClientDto,
} from './chamber.dto';
import { ChamberContext, ChamberGuard, CurrentChamber } from './chamber.guard';
import { ChamberService } from './chamber.service';
import { CurrentIntern, InternContext, InternGuard, InternService } from './intern.service';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** Lawyer chamber portal. Everything is scoped to the caller's own chamber; there is no chamber id in any route. */
@ApiTags('chamber')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('LAWYER')
@UseGuards(ChamberGuard)
@Controller('chamber')
export class ChamberController {
  constructor(
    private readonly chamber: ChamberService,
    private readonly interns: ChamberInternsService,
    private readonly certificates: CertificateService,
  ) {}

  @Get('profile')
  profile(@CurrentChamber() c: ChamberContext) {
    return this.chamber.getProfile(c);
  }

  @Put('profile')
  updateProfile(
    @CurrentChamber() c: ChamberContext,
    @Body() dto: UpdateChamberProfileDto,
    @Req() req: Request,
  ) {
    return this.chamber.updateProfile(c, dto, meta(req));
  }

  @Get('dashboard')
  dashboard(@CurrentChamber() c: ChamberContext) {
    return this.chamber.dashboard(c);
  }

  @Get('cases')
  cases(@CurrentChamber() c: ChamberContext) {
    return this.chamber.myCases(c);
  }

  // clients
  @Get('clients')
  clients(@CurrentChamber() c: ChamberContext, @Query() q: ClientListQueryDto) {
    return this.chamber.listClients(c, q);
  }

  @Get('client-options')
  clientOptions(@CurrentChamber() c: ChamberContext) {
    return this.chamber.clientOptions(c);
  }

  @Post('clients')
  createClient(
    @CurrentChamber() c: ChamberContext,
    @Body() dto: CreateClientDto,
    @Req() req: Request,
  ) {
    return this.chamber.createClient(c, dto, meta(req));
  }

  @Get('clients/:id')
  client(@CurrentChamber() c: ChamberContext, @Param('id', ParseIdPipe) id: string) {
    return this.chamber.clientDetail(c, id);
  }

  @Patch('clients/:id')
  updateClient(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateClientDto,
    @Req() req: Request,
  ) {
    return this.chamber.updateClient(c, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('clients/:id/retainer/deposit')
  deposit(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: DepositDto,
    @Req() req: Request,
  ) {
    return this.chamber.deposit(c, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('clients/:id/low-balance-alert')
  alert(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.chamber.issueLowBalanceAlert(c, id, meta(req));
  }

  // billable hours and retainer
  @Post('billable')
  createBillable(
    @CurrentChamber() c: ChamberContext,
    @Body() dto: CreateBillableDto,
    @Req() req: Request,
  ) {
    return this.chamber.createBillable(c, dto, meta(req));
  }

  @Get('billable')
  billable(@CurrentChamber() c: ChamberContext, @Query() q: BillableQueryDto) {
    return this.chamber.listBillable(c, q);
  }

  @Get('retainer-summary')
  retainerSummary(@CurrentChamber() c: ChamberContext) {
    return this.chamber.retainerSummary(c);
  }

  // expenses
  @Get('expenses')
  expenses(@CurrentChamber() c: ChamberContext, @Query() q: PageQueryDto) {
    return this.chamber.listExpenses(c, q);
  }

  @Post('expenses')
  createExpense(
    @CurrentChamber() c: ChamberContext,
    @Body() dto: CreateExpenseDto,
    @Req() req: Request,
  ) {
    return this.chamber.createExpense(c, dto, meta(req));
  }

  // interns
  @Get('interns')
  internList(@CurrentChamber() c: ChamberContext) {
    return this.interns.list(c);
  }

  @Post('interns')
  createIntern(
    @CurrentChamber() c: ChamberContext,
    @Body() dto: CreateInternDto,
    @Req() req: Request,
  ) {
    return this.interns.create(c, dto, meta(req));
  }

  @Get('interns/:id')
  intern(@CurrentChamber() c: ChamberContext, @Param('id', ParseIdPipe) id: string) {
    return this.interns.detail(c, id);
  }

  @Patch('interns/:id/status')
  internStatus(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: InternStatusDto,
    @Req() req: Request,
  ) {
    return this.interns.setStatus(c, id, dto, meta(req));
  }

  /** Completion certificate: eligibility (at least one approved research log) and the issued certificate. */
  @Get('interns/:id/certificate')
  certificate(@CurrentChamber() c: ChamberContext, @Param('id', ParseIdPipe) id: string) {
    return this.certificates.forLawyer(c, id);
  }

  @Post('interns/:id/certificate')
  issueCertificate(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return this.certificates.issue(c, id, meta(req));
  }

  @Get('interns/:id/certificate/pdf')
  async certificatePdf(@CurrentChamber() c: ChamberContext, @Param('id', ParseIdPipe) id: string) {
    return this.certificates.download(await this.certificates.lawyerCertificate(c, id));
  }

  @HttpCode(HttpStatus.OK)
  @Post('interns/:id/certificate/verify')
  async verifyCertificate(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.certificates.verify(await this.certificates.lawyerCertificate(c, id));
  }

  @Get('research-logs')
  logs(@CurrentChamber() c: ChamberContext, @Query() q: ResearchLogQueryDto) {
    return this.interns.listLogs(c, q);
  }

  @Patch('research-logs/:id/review')
  review(
    @CurrentChamber() c: ChamberContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ReviewLogDto,
    @Req() req: Request,
  ) {
    return this.interns.review(c, id, dto, meta(req));
  }
}

/** The intern's own portal. Requires an active, verified supervising lawyer. */
@ApiTags('intern')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('INTERN')
@UseGuards(InternGuard)
@Controller('intern')
export class InternController {
  constructor(
    private readonly intern: InternService,
    private readonly certificates: CertificateService,
  ) {}

  @Get('certificate')
  certificate(@CurrentIntern() i: InternContext) {
    return this.certificates.forIntern(i);
  }

  @Get('certificate/pdf')
  async certificatePdf(@CurrentIntern() i: InternContext) {
    return this.certificates.download(await this.certificates.internCertificate(i));
  }

  @HttpCode(HttpStatus.OK)
  @Post('certificate/verify')
  async verifyCertificate(@CurrentIntern() i: InternContext) {
    return this.certificates.verify(await this.certificates.internCertificate(i));
  }

  @Get('summary')
  summary(@CurrentIntern() i: InternContext) {
    return this.intern.summary(i);
  }

  @Get('cases')
  cases(@CurrentIntern() i: InternContext) {
    return this.intern.cases(i);
  }

  @Get('research-logs')
  logs(@CurrentIntern() i: InternContext, @Query() q: PageQueryDto) {
    return this.intern.listLogs(i, q);
  }

  @Post('research-logs')
  createLog(@CurrentIntern() i: InternContext, @Body() dto: ResearchLogDto, @Req() req: Request) {
    return this.intern.createLog(i, dto, meta(req));
  }

  @Patch('research-logs/:id')
  updateLog(
    @CurrentIntern() i: InternContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ResearchLogDto,
    @Req() req: Request,
  ) {
    return this.intern.updateLog(i, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('attendance/check-in')
  checkIn(@CurrentIntern() i: InternContext, @Body() dto: CheckInDto, @Req() req: Request) {
    return this.intern.checkIn(i, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('attendance/check-out')
  checkOut(@CurrentIntern() i: InternContext, @Body() dto: CheckInDto, @Req() req: Request) {
    return this.intern.checkOut(i, dto, meta(req));
  }

  @Get('attendance')
  attendance(@CurrentIntern() i: InternContext, @Query() q: AttendanceQueryDto) {
    return this.intern.history(i, q.month);
  }
}
