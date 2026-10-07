import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { ChamberInternsService } from './chamber-interns.service';
import { ChamberController, InternController } from './chamber.controller';
import { ChamberGuard } from './chamber.guard';
import { ChamberService } from './chamber.service';
import { InternGuard, InternService } from './intern.service';

@Module({
  controllers: [ChamberController, InternController],
  providers: [
    ChamberService,
    ChamberInternsService,
    CertificateService,
    InternService,
    ChamberGuard,
    InternGuard,
  ],
})
export class ChamberModule {}
