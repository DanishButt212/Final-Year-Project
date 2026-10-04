import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { Messages } from '../messages';
import { Role } from '../../generated/prisma/client';
import { SecurityService } from '../../security/security.service';

/** Registered globally after JwtAuthGuard. Routes without @Roles() allow any authenticated user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly security?: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user || !required.includes(user.role)) {
      // A signed-in account that is refused on an /admin route is a possible privilege escalation.
      if (user && user.role !== 'ADMIN' && req.originalUrl.startsWith('/api/admin')) {
        await this.security?.recordEscalation({
          actor: { id: user.id, role: user.role },
          ip: req.ip,
          method: req.method,
          route: req.originalUrl,
          code: 'ADMIN_ROUTE_FORBIDDEN',
        });
      }
      throw new ForbiddenException(Messages.FORBIDDEN);
    }
    return true;
  }
}
