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
  /** Version 2 also binds the proof to the case and to who/where was served. Absent: version 1. */
  subject?: {
    caseId: string;
    ucn: string;
    recipientName: string;
    recipientCnic: string | null;
    serviceAddress: string;
  };
}

/** Seal version used for new proofs. */
export const CURRENT_SEAL_VERSION = 2;

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

  /** Fixed key order so the same data always gives the same seal. Version 1 payload is kept unchanged. */
  private canonical(i: SealInput, version: number): string {
    const v1 = {
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
    };
    if (version === 1) return JSON.stringify(v1);
    if (!i.subject) throw new Error('A version 2 seal needs the case and recipient details.');
    return JSON.stringify({
      v: 2,
      ...v1,
      caseId: i.subject.caseId,
      ucn: i.subject.ucn,
      recipientName: i.subject.recipientName,
      recipientCnic: i.subject.recipientCnic,
      serviceAddress: i.subject.serviceAddress,
    });
  }

  /** Seals with version 2 when the case/recipient details are given, otherwise version 1 (seed data). */
  seal(input: SealInput, version = input.subject ? CURRENT_SEAL_VERSION : 1): string {
    return createHmac('sha256', this.secret).update(this.canonical(input, version)).digest('hex');
  }

  matches(input: SealInput, seal: string, version = 1): boolean {
    const a = Buffer.from(this.seal(input, version), 'hex');
    const b = Buffer.from(seal, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
