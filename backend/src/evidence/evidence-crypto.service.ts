import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  type CipherGCM,
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import { PassThrough, pipeline, type Readable } from 'node:stream';
import { StorageService } from '../storage/storage.service';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedFile {
  iv: string;
  authTag: string;
  sha256: string;
  size: number;
}

/**
 * AES-256-GCM encryption at rest for evidence files. The key comes from EVIDENCE_ENCRYPTION_KEY
 * (32 random bytes, base64). The application refuses to start the evidence module without a valid key.
 */
@Injectable()
export class EvidenceCryptoService {
  private readonly key: Buffer;

  constructor(
    config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const raw = config.get<string>('EVIDENCE_ENCRYPTION_KEY');
    const key = raw && raw !== 'CHANGE_ME' ? Buffer.from(raw, 'base64') : null;
    if (!key || key.length !== 32) {
      throw new Error(
        'EVIDENCE_ENCRYPTION_KEY is missing or invalid. Set it to 32 random bytes encoded as base64 (see backend/.env.example).',
      );
    }
    this.key = key;
  }

  /** Streams a plain temp file through hashing and encryption into storage. */
  async encryptToStorage(tempPath: string, storageKey: string): Promise<EncryptedFile> {
    const iv = randomBytes(12);
    const cipher: CipherGCM = createCipheriv(ALGORITHM, this.key, iv);
    const hash = createHash('sha256');
    let size = 0;
    const source = createReadStream(tempPath);
    source.on('data', (chunk) => {
      hash.update(chunk);
      size += chunk.length;
    });
    const out = new PassThrough();
    pipeline(source, cipher, out, () => undefined); // an error destroys `out`, which fails the storage write
    await this.storage.saveFromStream(out, storageKey);
    return {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      sha256: hash.digest('hex'),
      size,
    };
  }

  /** Decrypts while streaming. A tampered file makes the stream fail at the end (GCM authentication). */
  decryptStream(storageKey: string, ivB64: string, tagB64: string): Readable {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = new PassThrough();
    pipeline(this.storage.createReadStream(storageKey), decipher, out, () => undefined);
    return out;
  }
}
