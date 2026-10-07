import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import { Messages } from './common/messages';
import { isLoopback, normalizeIp } from './security/ip';
import { SecurityService } from './security/security.service';

/** Shared by main.ts and the e2e tests so both run with identical global behaviour. */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  // Behind a reverse proxy, set TRUST_PROXY (for example 1) so req.ip is the real client address.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const value = /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy;
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set(
      'trust proxy',
      value,
    );
  }
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    // With the Vercel rewrite the browser calls /api on its own origin; CORS only matters for direct calls.
    origin: config.get<string[]>('CORS_ORIGINS') ?? config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client'],
    exposedHeaders: ['Content-Disposition', 'X-Report-Code'],
  });
  // Blocked hosts get 403 before anything else runs. Loopback addresses are never blocked.
  const security = app.get(SecurityService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = normalizeIp(req.ip);
    if (!ip || isLoopback(ip)) return next();
    security
      .isBlocked(ip)
      .then((blocked) => {
        if (!blocked) return next();
        res
          .status(403)
          .json({ statusCode: 403, code: 'ACCESS_DENIED', message: Messages.ACCESS_DENIED });
      })
      .catch(() => next());
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
