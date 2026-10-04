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
import { unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import multer from 'multer';
import { finalize, Observable } from 'rxjs';
import { ALLOWED_EXTENSIONS, SCREENING_FAILED_MESSAGE } from './mock-screening.service';

export const MAX_EVIDENCE_FILES = 5;
/** multer's absolute cap; the policy limit (max_evidence_mb) is checked in the service. */
export const EVIDENCE_HARD_CAP_BYTES = 200 * 1024 * 1024;

const ALL_EXTENSIONS = new Set(Object.values(ALLOWED_EXTENSIONS).flat());

const reject = (code: string, message: string) => new BadRequestException({ code, message });

/** Receives exhibit uploads (field `files`) into a temp folder and always deletes the temp files afterwards. */
@Injectable()
export class EvidenceUploadInterceptor implements NestInterceptor {
  private readonly handler: RequestHandler;

  constructor(config: ConfigService) {
    const tmpDir = config.getOrThrow<string>('UPLOAD_TMP_DIR');
    mkdirSync(tmpDir, { recursive: true });
    this.handler = multer({
      storage: multer.diskStorage({
        destination: tmpDir,
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
      }),
      limits: {
        fileSize: EVIDENCE_HARD_CAP_BYTES,
        files: MAX_EVIDENCE_FILES,
        fields: 10,
        fieldSize: 64 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).slice(1).toLowerCase();
        if (!ALL_EXTENSIONS.has(ext)) {
          return cb(reject('SECURITY_SCREENING_FAILED', SCREENING_FAILED_MESSAGE));
        }
        cb(null, true);
      },
    }).array('files', MAX_EVIDENCE_FILES);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    await new Promise<void>((resolve, rejectPromise) => {
      this.handler(req, res, (error?: unknown) => {
        if (!error) return resolve();
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_COUNT') {
            return rejectPromise(
              reject(
                'TOO_MANY_FILES',
                `You can submit at most ${MAX_EVIDENCE_FILES} files at a time.`,
              ),
            );
          }
          if (error.code === 'LIMIT_FILE_SIZE') {
            return rejectPromise(
              reject('EVIDENCE_TOO_LARGE', 'A file is larger than the 200MB hard limit.'),
            );
          }
          return rejectPromise(reject('SECURITY_SCREENING_FAILED', SCREENING_FAILED_MESSAGE));
        }
        rejectPromise(error);
      });
    });
    return next.handle().pipe(
      finalize(() => {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        for (const f of files) void unlink(f.path).catch(() => undefined);
      }),
    );
  }
}
