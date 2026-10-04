import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { SealService } from './seal.service';
import { ServerGuard, ServerService } from './server.service';
import { SummonsAdminService } from './summons-admin.service';
import { SummonsCaseService } from './summons-case.service';
import {
  AdminSummonsController,
  CaseSummonsController,
  ServerController,
} from './summons.controller';
import { FinalizeUploadInterceptor, ProfileUploadInterceptor } from './summons.files';

/** Importing this module requires SUMMONS_SEAL_SECRET (and the evidence key): the app refuses to start without them. */
@Module({
  imports: [EvidenceModule],
  controllers: [AdminSummonsController, CaseSummonsController, ServerController],
  providers: [
    SealService,
    SummonsAdminService,
    SummonsCaseService,
    ServerService,
    ServerGuard,
    FinalizeUploadInterceptor,
    ProfileUploadInterceptor,
  ],
})
export class SummonsModule {}
