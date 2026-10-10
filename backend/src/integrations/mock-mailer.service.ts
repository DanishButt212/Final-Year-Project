import { Injectable, Logger } from '@nestjs/common';

/** Masks an address for logs: "a***@example.com". */
export function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/**
 * MOCK email/SMS sender: messages are written to the log instead of being delivered.
 * The full body (which can hold a password reset or account setup link) is logged only when
 * NODE_ENV=development. Everywhere else, including production on Render, only the masked recipient and the
 * subject are logged, so one-time links never reach the server logs.
 */
@Injectable()
export class MockMailerService {
  private readonly logger = new Logger('MockMailer');

  send(to: string, subject: string, body: string): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[MOCK EMAIL] to=${to} subject="${subject}"\n${body}`);
      return;
    }
    this.logger.log(`[MOCK EMAIL] to=${maskEmail(to)} subject="${subject}" (body not logged)`);
  }
}
