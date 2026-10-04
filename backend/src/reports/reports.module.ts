import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { ReportSealService } from './report-seal.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Importing this module requires REPORT_SEAL_SECRET: the app refuses to start without it. */
@Module({
  controllers: [ReportsController],
  providers: [PerformanceService, ReportSealService, ReportsService],
})
export class ReportsModule {}
