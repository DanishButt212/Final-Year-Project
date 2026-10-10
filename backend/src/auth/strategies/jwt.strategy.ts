import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators';
import { Messages } from '../../common/messages';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  role: Role;
  iat?: number;
  /** Issued-at in milliseconds (tokens from Phase 5C on). */
  ims?: number;
  /** Token id: logout revokes this one token. */
  jti?: string;
}

/** Reads the JWT from the httpOnly cookie first, then from "Authorization: Bearer" (mobile app). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const cookieName = config.getOrThrow<string>('COOKIE_NAME');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.[cookieName] as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Re-checks the account on every request so suspended users are locked out immediately. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, status: true, sessionsInvalidatedAt: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException(Messages.UNAUTHORIZED);
    // The security engine ended this account's sessions: tokens issued before that moment are rejected.
    const cutoff = user.sessionsInvalidatedAt?.getTime();
    // ims has millisecond precision; older tokens only carry iat (whole seconds), compared in seconds.
    const stale =
      cutoff !== undefined &&
      (payload.ims !== undefined
        ? payload.ims < cutoff
        : (payload.iat ?? 0) < Math.floor(cutoff / 1000));
    if (stale) {
      throw new UnauthorizedException({
        code: 'SESSION_TERMINATED',
        message: Messages.SESSION_TERMINATED,
      });
    }
    if (payload.jti) {
      const revoked = await this.prisma.revokedToken.findUnique({
        where: { jti: payload.jti },
        select: { jti: true },
      });
      if (revoked) {
        throw new UnauthorizedException({
          code: 'SESSION_REVOKED',
          message: Messages.SESSION_REVOKED,
        });
      }
    }
    return { id: user.id, role: user.role, email: user.email };
  }
}
