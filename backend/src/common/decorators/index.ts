import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without authentication. Everything else requires a valid JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

/** Injects the authenticated user populated by JwtStrategy. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});
