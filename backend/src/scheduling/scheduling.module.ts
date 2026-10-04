import { Module } from '@nestjs/common';
import { HearingsService } from './hearings.service';
import { AdminSchedulingController, HearingsController } from './scheduling.controller';
import { SchedulingEngine } from './scheduling.engine';
import { SchedulingService } from './scheduling.service';

@Module({
  controllers: [AdminSchedulingController, HearingsController],
  providers: [SchedulingEngine, SchedulingService, HearingsService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
