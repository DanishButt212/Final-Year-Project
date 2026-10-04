import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { PerformanceService } from './performance.service';
import { ExportReportDto, HistoryQueryDto, PerformanceQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('admin-reports')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/reports')
export class ReportsController {
  constructor(
    private readonly performance: PerformanceService,
    private readonly reports: ReportsService,
  ) {}

  /** "Compile Report Profile Data Layout". */
  @Get('performance')
  compile(@Query() q: PerformanceQueryDto) {
    return this.performance.compile(q);
  }

  /** Dropdown values for the filter form (judges, courts, case categories). */
  @Get('options')
  options() {
    return this.performance.options();
  }

  /** "Execute Data Export Compilation": streams the stamped PDF or Excel file. */
  @Post('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExportReportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.reports.export(user, dto, meta(req));
    res.setHeader('X-Report-Code', out.code);
    return out.file;
  }

  @Get('history')
  history(@Query() q: HistoryQueryDto) {
    return this.reports.history(q);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: Request,
  ) {
    return (await this.reports.download(user, id, meta(req))).file;
  }

  @Post(':id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Req() req: Request) {
    return this.reports.verify(user, id, meta(req));
  }
}
