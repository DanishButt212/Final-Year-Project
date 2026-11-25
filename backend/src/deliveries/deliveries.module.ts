import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { DeliveryAcknowledgmentInterceptor } from '../summons/summons.files';
import { ServerGuard } from '../summons/server.service';
import {
  AdminDeliveriesController,
  DeliveryFilesController,
  ServerDeliveriesController,
} from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [EvidenceModule],
  controllers: [AdminDeliveriesController, ServerDeliveriesController, DeliveryFilesController],
  providers: [DeliveriesService, ServerGuard, DeliveryAcknowledgmentInterceptor],
})
export class DeliveriesModule {}
