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
    if (cutoff !== undefined && (payload.iat ?? 0) * 1000 < cutoff) {
      throw new UnauthorizedException({
        code: 'SESSION_TERMINATED',
        message: Messages.SESSION_TERMINATED,
      });
    }
    return { id: user.id, role: user.role, email: user.email };
  }
}
