import { Module } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { PdfUploadInterceptor } from './pdf-upload.interceptor';

@Module({
  controllers: [CasesController],
  providers: [CasesService, PdfUploadInterceptor],
  exports: [CasesService],
})
export class CasesModule {}
