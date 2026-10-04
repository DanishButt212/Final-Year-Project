import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { Messages } from '../messages';
import { Role } from '../../generated/prisma/client';

/** Registered globally after JwtAuthGuard. Routes without @Roles() allow any authenticated user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user || !required.includes(user.role)) throw new ForbiddenException(Messages.FORBIDDEN);
    return true;
  }
}
