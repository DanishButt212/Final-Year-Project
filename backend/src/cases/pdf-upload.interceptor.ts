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
import multer from 'multer';
import { finalize, Observable } from 'rxjs';
import { invalidFileMessage, Messages } from '../common/messages';
import { SettingsService } from '../settings/settings.service';
import { hasPdfExtension, HARD_CAP_BYTES, MAX_FILES_PER_REQUEST, removeFiles } from './pdf-files';

const invalidFile = (message: string) => new BadRequestException({ code: 'INVALID_FILE', message });

/**
 * Receives multipart uploads (field `files`, up to 10 PDFs) into a temp folder. multer enforces only the
 * 100 MB hard cap; the administrator's policy limit (max_attachment_mb) is checked in the service.
 * It rejects wrong extensions and absurdly large files while streaming, and deletes every temp file
 * when the request ends, whether it succeeded or failed. Content checks happen in the service.
 */
@Injectable()
export class PdfUploadInterceptor implements NestInterceptor {
  private readonly handler: RequestHandler;

  constructor(
    config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    const tmpDir = config.getOrThrow<string>('UPLOAD_TMP_DIR');
    mkdirSync(tmpDir, { recursive: true });
    this.handler = multer({
      // Random names: the client's file name never touches the file system.
      storage: multer.diskStorage({
        destination: tmpDir,
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
      }),
      limits: {
        fileSize: HARD_CAP_BYTES,
        files: MAX_FILES_PER_REQUEST,
        fields: 20,
        fieldSize: 512 * 1024, // the JSON `data` field
      },
      fileFilter: (_req, file, cb) => {
        if (!hasPdfExtension(file.originalname)) {
          return void this.settings
            .maxAttachmentMb()
            .then((mb) => cb(invalidFile(invalidFileMessage(mb))));
        }
        cb(null, true);
      },
    }).array('files', MAX_FILES_PER_REQUEST);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    await new Promise<void>((resolve, reject) => {
      this.handler(req, res, (error?: unknown) => {
        if (!error) return resolve();
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_COUNT')
            return reject(invalidFile(Messages.TOO_MANY_FILES));
          // LIMIT_FILE_SIZE, unexpected field, malformed parts ...
          return void this.settings
            .maxAttachmentMb()
            .then((mb) => reject(invalidFile(invalidFileMessage(mb))));
        }
        reject(error);
      });
    });

    return next.handle().pipe(
      finalize(() => {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        void removeFiles(files.map((f) => f.path)); // moved files are already gone; failures are ignored
      }),
    );
  }
}
