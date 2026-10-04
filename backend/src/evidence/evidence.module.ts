import { Module } from '@nestjs/common';
import { EvidenceCryptoService } from './evidence-crypto.service';
import { EvidenceUploadInterceptor } from './evidence-upload.interceptor';
import { EvidenceController, JudgeEvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { MockScreeningService } from './mock-screening.service';

/** Importing this module requires EVIDENCE_ENCRYPTION_KEY: the app refuses to start without it. */
@Module({
  controllers: [EvidenceController, JudgeEvidenceController],
  providers: [
    EvidenceCryptoService,
    MockScreeningService,
    EvidenceUploadInterceptor,
    EvidenceService,
  ],
  exports: [EvidenceCryptoService],
})
export class EvidenceModule {}
