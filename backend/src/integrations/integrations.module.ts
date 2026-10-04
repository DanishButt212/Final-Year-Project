import { Global, Module } from '@nestjs/common';
import { MockNadraService } from './nadra/mock-nadra.service';
import { MockBarCouncilService } from './mock-bar-council.service';
import { MockMailerService } from './mock-mailer.service';

/** Mocked external systems: NADRA, Bar Council, email/SMS (payment gateway follows in later phases). */
@Global()
@Module({
  providers: [MockNadraService, MockMailerService, MockBarCouncilService],
  exports: [MockNadraService, MockMailerService, MockBarCouncilService],
})
export class IntegrationsModule {}
