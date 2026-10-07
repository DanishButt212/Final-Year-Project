import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { StorageService } from './storage.service';

/**
 * Stores files in an S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3, MinIO). Objects are written
 * exactly as the local driver writes them: evidence and summons proofs arrive already AES-256-GCM encrypted, so the
 * bucket only ever holds ciphertext for those. Keys follow the same rules as the local driver.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      region: config.get<string>('S3_REGION') || 'auto',
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  /** Same rules as the local driver: relative, forward-slash keys that never contain "..". */
  private keyFor(key: string): string {
    if (
      !key ||
      key.includes('\0') ||
      key.includes('\\') ||
      key.startsWith('/') ||
      key.split('/').includes('..')
    ) {
      throw new Error('Invalid storage key');
    }
    return key;
  }

  private async upload(body: Readable, key: string): Promise<void> {
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.keyFor(key), Body: body },
    }).done();
  }

  async saveFromPath(tempPath: string, key: string): Promise<void> {
    await this.upload(createReadStream(tempPath), key);
    await unlink(tempPath).catch(() => undefined);
  }

  async saveFromStream(stream: Readable, key: string): Promise<void> {
    await this.upload(stream, key);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
  }

  /** Returns at once; the object body is piped in when it arrives, and a failure destroys the stream. */
  createReadStream(key: string): Readable {
    const out = new PassThrough();
    const Key = this.keyFor(key);
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key }))
      .then((res) => {
        const body = res.Body as Readable | undefined;
        if (!body) throw new Error('Empty object body');
        body.on('error', (e) => out.destroy(e));
        body.pipe(out);
      })
      .catch((e: Error) => out.destroy(e));
    return out;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
      return true;
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  /** Deletes the object named `prefix` and everything under `prefix/` (like removing a folder locally). */
  async removePrefix(prefix: string): Promise<void> {
    const base = this.keyFor(prefix).replace(/\/+$/, '');
    await this.remove(base).catch(() => undefined);
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${base}/`,
          ContinuationToken: token,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
