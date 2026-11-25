import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { PdfUploadInterceptor } from './pdf-upload.interceptor';

@Module({
  imports: [FeesModule],
  controllers: [CasesController],
  providers: [CasesService, PdfUploadInterceptor],
  exports: [CasesService],
})
export class CasesModule {}
