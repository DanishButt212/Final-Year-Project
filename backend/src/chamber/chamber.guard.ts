import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators';
import { nextSequence } from '../common/counters';
import { ChamberProfile } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The caller's chamber: the "silo" every /chamber query is scoped to. */
export interface ChamberContext {
  userId: string;
  lawyerId: string;
  chamber: ChamberProfile;
}

export const CurrentChamber = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request & { chamberCtx: ChamberContext }>().chamberCtx;
});

const deny = (code: string, message: string) => new ForbiddenException({ code, message });

/**
 * Resolves the logged-in lawyer's chamber (created lazily on first access) and rejects unverified lawyers and
 * suspended chambers. Never reads a chamber id from the request, so another chamber can never be addressed.
 */
@Injectable()
export class ChamberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser; chamberCtx?: ChamberContext }>();
    const user = req.user;
    if (!user || user.role !== 'LAWYER')
      throw deny('FORBIDDEN', 'Only lawyers can open a chamber.');

    const profile = await this.prisma.lawyerProfile.findUnique({
      where: { userId: user.id },
      include: {
        chamber: true,
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true, status: true },
        },
      },
    });
    if (!profile || profile.verificationStatus !== 'VERIFIED') {
      throw deny(
        'LAWYER_NOT_VERIFIED',
        'Your lawyer account must be verified by the registry before you can use the chamber.',
      );
    }
    if (profile.user.status !== 'ACTIVE') {
      throw deny('CHAMBER_SUSPENDED', 'This chamber license is suspended.');
    }

    let chamber = profile.chamber;
    if (!chamber) {
      chamber = await this.prisma.$transaction(async (tx) => {
        const n = await nextSequence(tx, 'CHAMBER', 0);
        return tx.chamberProfile.upsert({
          where: { lawyerId: profile.id },
          update: {},
          create: {
            lawyerId: profile.id,
            chamberCode: `CH-${String(n).padStart(6, '0')}`,
            name: `${profile.user.lastName} & Associates`,
            email: profile.user.email,
            phone: profile.user.phone,
          },
        });
      });
    }
    if (chamber.licenseStatus !== 'ACTIVE') {
      throw deny('CHAMBER_SUSPENDED', 'This chamber license is suspended.');
    }
    req.chamberCtx = { userId: user.id, lawyerId: profile.id, chamber };
    return true;
  }
}
