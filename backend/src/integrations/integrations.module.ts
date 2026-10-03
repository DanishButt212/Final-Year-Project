import { Global, Module } from '@nestjs/common';
import { MockNadraService } from './nadra/mock-nadra.service';
import { MockMailerService } from './mock-mailer.service';

/** Mocked external systems: NADRA, email/SMS (payment gateway and Bar Council follow in later phases). */
@Global()
@Module({
  providers: [MockNadraService, MockMailerService],
  exports: [MockNadraService, MockMailerService],
})
export class IntegrationsModule {}
