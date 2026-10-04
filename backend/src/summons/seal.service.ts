import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SealInput {
  summonsId: string;
  serverId: string;
  serviceMode: string;
  executedAt: Date;
  latitude: string;
  longitude: string;
  accuracyM: string;
  notes: string;
  photoSha256: string;
  signatureSha256: string | null;
}

/**
 * Metadata seal of an execution proof: HMAC-SHA256 over a canonical JSON, keyed with SUMMONS_SEAL_SECRET
 * (32 random bytes, base64). The module refuses to start without a valid secret.
 */
@Injectable()
export class SealService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('SUMMONS_SEAL_SECRET');
    const key = raw && raw !== 'CHANGE_ME' ? Buffer.from(raw, 'base64') : null;
    if (!key || key.length !== 32) {
      throw new Error(
        'SUMMONS_SEAL_SECRET is missing or invalid. Set it to 32 random bytes encoded as base64 (see backend/.env.example).',
      );
    }
    this.secret = key;
  }

  /** Fixed key order so the same data always gives the same seal. */
  private canonical(i: SealInput): string {
    return JSON.stringify({
      summonsId: i.summonsId,
      serverId: i.serverId,
      serviceMode: i.serviceMode,
      executedAt: i.executedAt.toISOString(),
      latitude: i.latitude,
      longitude: i.longitude,
      accuracyM: i.accuracyM,
      notes: i.notes,
      photoSha256: i.photoSha256,
      signatureSha256: i.signatureSha256,
    });
  }

  seal(input: SealInput): string {
    return createHmac('sha256', this.secret).update(this.canonical(input)).digest('hex');
  }

  matches(input: SealInput, seal: string): boolean {
    const a = Buffer.from(this.seal(input), 'hex');
    const b = Buffer.from(seal, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
