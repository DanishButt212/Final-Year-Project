import { ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';
import type { Request } from 'express';
import { SecurityService } from '../../security/security.service';
import { Messages } from '../messages';

/** Registered globally: every route needs a JWT unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly security?: SecurityService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    try {
      return (await super.canActivate(context)) as boolean;
    } catch (error) {
      // A forged or malformed token on an /admin route is a possible privilege escalation attempt
      // (expired tokens are normal and are not counted).
      const req = context.switchToHttp().getRequest<Request & { jwtInvalid?: boolean }>();
      if (req.jwtInvalid && req.originalUrl.startsWith('/api/admin')) {
        await this.security?.recordEscalation({
          ip: req.ip,
          method: req.method,
          route: req.originalUrl,
          code: 'ADMIN_ROUTE_INVALID_TOKEN',
        });
      }
      throw error;
    }
  }

  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info?: { name?: string },
    context?: ExecutionContext,
  ): TUser {
    if (err instanceof UnauthorizedException) {
      const body = err.getResponse() as { code?: string };
      if (body?.code === 'SESSION_TERMINATED') throw err;
    }
    if (!user && info?.name === 'JsonWebTokenError' && context) {
      context.switchToHttp().getRequest<Request & { jwtInvalid?: boolean }>().jwtInvalid = true;
    }
    if (err || !user) throw new UnauthorizedException(Messages.UNAUTHORIZED);
    return user;
  }
}
