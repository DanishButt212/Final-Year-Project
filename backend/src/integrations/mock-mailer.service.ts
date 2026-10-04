import { Injectable, Logger } from '@nestjs/common';

/** MOCK email/SMS sender: messages are written to the console instead of being delivered. */
@Injectable()
export class MockMailerService {
  private readonly logger = new Logger('MockMailer');

  send(to: string, subject: string, body: string): void {
    this.logger.log(`[MOCK EMAIL] to=${to} subject="${subject}"\n${body}`);
  }
}
