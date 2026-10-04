import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Messages } from '../messages';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/** Every error leaves the API in the same shape: { statusCode, code, message, details?, path, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message: string = Messages.INTERNAL;
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      statusCode = HttpStatus.TOO_MANY_REQUESTS;
      code = 'TOO_MANY_REQUESTS';
      message = Messages.TOO_MANY_REQUESTS;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = CODE_BY_STATUS[statusCode] ?? 'ERROR';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const obj = body as Record<string, unknown>;
        if (typeof obj.code === 'string') code = obj.code;
        if (typeof obj.message === 'string') message = obj.message;
        else if (Array.isArray(obj.message)) message = String(obj.message[0]);
        if (obj.details !== undefined) details = obj.details;
      }
      if (statusCode === 404 && message.startsWith('Cannot ')) message = Messages.NOT_FOUND;
    } else {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    const payload: ErrorBody = {
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(payload);
  }
}
