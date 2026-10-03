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
import { Messages } from '../common/messages';
import { hasPdfExtension, MAX_FILES_PER_REQUEST, MAX_PDF_BYTES, removeFiles } from './pdf-files';

const invalidFile = (message: string = Messages.INVALID_FILE) =>
  new BadRequestException({ code: 'INVALID_FILE', message });

/**
 * Receives multipart uploads (field `files`, up to 10 PDFs of at most 25 MB) into a temp folder.
 * It rejects wrong extensions and oversize files while streaming, and deletes every temp file
 * when the request ends, whether it succeeded or failed. Content checks happen in the service.
 */
@Injectable()
export class PdfUploadInterceptor implements NestInterceptor {
  private readonly handler: RequestHandler;

  constructor(config: ConfigService) {
    const tmpDir = config.getOrThrow<string>('UPLOAD_TMP_DIR');
    mkdirSync(tmpDir, { recursive: true });
    this.handler = multer({
      // Random names: the client's file name never touches the file system.
      storage: multer.diskStorage({
        destination: tmpDir,
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
      }),
      limits: {
        fileSize: MAX_PDF_BYTES,
        files: MAX_FILES_PER_REQUEST,
        fields: 20,
        fieldSize: 512 * 1024, // the JSON `data` field
      },
      fileFilter: (_req, file, cb) => {
        if (!hasPdfExtension(file.originalname)) return cb(invalidFile());
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
          return reject(invalidFile()); // LIMIT_FILE_SIZE, unexpected field, malformed parts ...
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
