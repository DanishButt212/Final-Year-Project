import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import multer from 'multer';
import { finalize, Observable } from 'rxjs';

export const SCREENING_FAILED = 'Security Screening Failed: Attachment discarded.';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 500 * 1024;
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export const screeningFailed = () =>
  new BadRequestException({ code: 'SECURITY_SCREENING_FAILED', message: SCREENING_FAILED });

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

async function head(path: string): Promise<Buffer> {
  const h = await open(path, 'r');
  try {
    const buf = Buffer.alloc(8);
    const { bytesRead } = await h.read(buf, 0, 8, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await h.close();
  }
}

const startsWith = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Checks the real file content (magic bytes) and the size. Extension and client MIME type are not trusted. */
export async function isImage(
  file: Express.Multer.File,
  maxBytes: number,
  kinds: ('jpeg' | 'png')[],
): Promise<boolean> {
  if (file.size <= 0 || file.size > maxBytes) return false;
  const b = await head(file.path);
  return (
    (kinds.includes('jpeg') && startsWith(b, JPEG)) || (kinds.includes('png') && startsWith(b, PNG))
  );
}

/** multipart receiver; fields are the allowed file field names. Temp files are always deleted afterwards. */
function makeInterceptor(fields: { name: string; maxCount: number }[], maxBytes: number) {
  @Injectable()
  class Upload implements NestInterceptor {
    private readonly handler: RequestHandler;

    constructor(config: ConfigService) {
      const tmpDir = config.getOrThrow<string>('UPLOAD_TMP_DIR');
      mkdirSync(tmpDir, { recursive: true });
      this.handler = multer({
        storage: multer.diskStorage({
          destination: tmpDir,
          filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
        }),
        limits: { fileSize: maxBytes, files: fields.length, fields: 20, fieldSize: 16 * 1024 },
      }).fields(fields);
    }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();
      await new Promise<void>((resolve, reject) => {
        this.handler(req, res, (error?: unknown) => {
          if (!error) return resolve();
          if (error instanceof multer.MulterError) return reject(screeningFailed());
          reject(error);
        });
      });
      return next.handle().pipe(
        finalize(() => {
          const grouped = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
          for (const list of Object.values(grouped)) {
            for (const f of list) void unlink(f.path).catch(() => undefined);
          }
        }),
      );
    }
  }
  return Upload;
}

/** Finalize: fields `photo` and `signature`. The multer cap is the larger limit; each file is checked again. */
export const FinalizeUploadInterceptor = makeInterceptor(
  [
    { name: 'photo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
  ],
  MAX_PHOTO_BYTES,
);

/** Profile photo: field `photo`. */
export const ProfileUploadInterceptor = makeInterceptor(
  [{ name: 'photo', maxCount: 1 }],
  MAX_PROFILE_PHOTO_BYTES,
);

export const uploaded = (req: Request, field: string): Express.Multer.File | undefined =>
  ((req.files ?? {}) as Record<string, Express.Multer.File[]>)[field]?.[0];
