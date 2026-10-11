import { Module } from '@nestjs/common';
import { PublicStatusController } from './public-status.controller';
import { PublicStatusService } from './public-status.service';

/** Endpoints reachable without an account (public case status). */
@Module({
  controllers: [PublicStatusController],
  providers: [PublicStatusService],
})
export class PublicModule {}
