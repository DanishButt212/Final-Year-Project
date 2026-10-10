import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like the JWT guard, but never refuses: a missing, expired, revoked or invalid token simply leaves
 * `req.user` empty. Used by GET /auth/session so a signed-out visitor gets 200 instead of a 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // not signed in
    }
    return true;
  }

  handleRequest<TUser>(_err: unknown, user: TUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
