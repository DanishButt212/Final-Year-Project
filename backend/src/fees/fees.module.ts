import { Module } from '@nestjs/common';
import { ChallansService } from './challans.service';
import { FeesController } from './fees.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [FeesController],
  providers: [ChallansService, PaymentsService],
  exports: [ChallansService],
})
export class FeesModule {}
