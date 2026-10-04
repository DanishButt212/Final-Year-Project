import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { stableStringify } from '../audit/audit-hash';

export interface ReportSealInput {
  code: string;
  kind: string;
  format: string;
  params: unknown;
  dataSha256: string;
  createdAt: Date;
}

/**
 * Verification seal of an exported report: HMAC-SHA256 keyed with REPORT_SEAL_SECRET (32 random bytes, base64).
 * The reports module refuses to start without a valid secret.
 */
@Injectable()
export class ReportSealService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('REPORT_SEAL_SECRET');
    const key = raw && raw !== 'CHANGE_ME' ? Buffer.from(raw, 'base64') : null;
    if (!key || key.length !== 32) {
      throw new Error(
        'REPORT_SEAL_SECRET is missing or invalid. Set it to 32 random bytes encoded as base64 (see backend/.env.example).',
      );
    }
    this.secret = key;
  }

  seal(i: ReportSealInput): string {
    const text = [
      i.code,
      i.kind,
      i.format,
      stableStringify(i.params),
      i.dataSha256,
      i.createdAt.toISOString(),
    ].join('|');
    return createHmac('sha256', this.secret).update(text).digest('hex');
  }

  matches(i: ReportSealInput, seal: string): boolean {
    const a = Buffer.from(this.seal(i), 'hex');
    const b = Buffer.from(seal, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
