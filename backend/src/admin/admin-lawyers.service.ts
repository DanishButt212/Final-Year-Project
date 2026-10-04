import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { MockBarCouncilService } from '../integrations/mock-bar-council.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestMeta } from './constants';
import { ListLawyersQueryDto } from './dto/admin.dto';

const lawyerSelect = {
  id: true,
  barNumber: true,
  verificationStatus: true,
  verifiedAt: true,
  rejectionReason: true,
  createdAt: true,
  verifiedBy: { select: { firstName: true, lastName: true } },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      cnic: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.LawyerProfileSelect;

type LawyerRow = Prisma.LawyerProfileGetPayload<{ select: typeof lawyerSelect }>;

const toItem = (l: LawyerRow) => ({
  id: l.id,
  barNumber: l.barNumber,
  verificationStatus: l.verificationStatus,
  verifiedAt: l.verifiedAt,
  verifiedBy: l.verifiedBy ? `${l.verifiedBy.firstName} ${l.verifiedBy.lastName}` : null,
  rejectionReason: l.rejectionReason,
  registeredAt: l.user.createdAt,
  user: l.user,
});

/** UC-2.2: legal practicing verification against the (mocked) Bar Council register. */
@Injectable()
export class AdminLawyersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly barCouncil: MockBarCouncilService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: ListLawyersQueryDto) {
    const where: Prisma.LawyerProfileWhereInput = {
      verificationStatus: q.status,
      ...(q.search
        ? {
            OR: [
              { barNumber: { contains: q.search, mode: 'insensitive' } },
              { user: { firstName: { contains: q.search, mode: 'insensitive' } } },
              { user: { lastName: { contains: q.search, mode: 'insensitive' } } },
              { user: { email: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows, pending, verified, rejected] = await this.prisma.$transaction([
      this.prisma.lawyerProfile.count({ where }),
      this.prisma.lawyerProfile.findMany({
        where,
        select: lawyerSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.lawyerProfile.count({ where: { verificationStatus: 'PENDING' } }),
      this.prisma.lawyerProfile.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.lawyerProfile.count({ where: { verificationStatus: 'REJECTED' } }),
    ]);
    return {
      data: rows.map(toItem),
      counts: { PENDING: pending, VERIFIED: verified, REJECTED: rejected },
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  private async load(id: string) {
    const lawyer = await this.prisma.lawyerProfile.findUnique({
      where: { id },
      select: lawyerSelect,
    });
    if (!lawyer) throw new NotFoundException(Messages.NOT_FOUND);
    return lawyer;
  }

  async barCheck(actor: AuthUser, id: string, meta: RequestMeta) {
    const lawyer = await this.load(id);
    const result = this.barCouncil.lookup(lawyer.barNumber);
    await this.audit.log({
      action: AuditAction.LAWYER_BAR_CHECK,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'LawyerProfile',
      entityId: id,
      metadata: { barNumber: result.barNumber, found: result.found },
      ...meta,
    });
    return result;
  }

  async verify(actor: AuthUser, id: string, meta: RequestMeta) {
    const lawyer = await this.load(id);
    if (lawyer.verificationStatus === 'VERIFIED') {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: 'This lawyer is already verified. Credentials are locked.',
      });
    }
    if (lawyer.user.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Reactivate this account before verifying it.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      // Conditional update: two admins clicking at once cannot both succeed.
      const done = await tx.lawyerProfile.updateMany({
        where: { id, verificationStatus: { not: 'VERIFIED' } },
        data: {
          verificationStatus: 'VERIFIED',
          verifiedById: actor.id,
          verifiedAt: new Date(),
          rejectionReason: null,
        },
      });
      if (done.count !== 1) {
        throw new ConflictException({
          code: 'ALREADY_VERIFIED',
          message: 'This lawyer is already verified. Credentials are locked.',
        });
      }
      await this.audit.logWithin(tx, {
        action: AuditAction.LAWYER_VERIFIED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'LawyerProfile',
        entityId: id,
        metadata: { barNumber: lawyer.barNumber, userId: lawyer.user.id },
        ...meta,
      });
      await this.notifications.notify(
        lawyer.user.id,
        {
          type: 'LAWYER_VERIFIED',
          title: 'Bar credentials verified',
          body: 'The registrar approved your bar credentials. You can now file cases.',
        },
        tx,
      );
    });
    return { message: Messages.LAWYER_VERIFIED, lawyer: toItem(await this.load(id)) };
  }

  async reject(actor: AuthUser, id: string, reason: string, meta: RequestMeta) {
    const lawyer = await this.load(id);
    if (lawyer.verificationStatus === 'VERIFIED') {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: 'A verified lawyer cannot be rejected. Suspend the account instead.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lawyerProfile.update({
        where: { id },
        data: { verificationStatus: 'REJECTED', rejectionReason: reason, verifiedById: actor.id },
      });
      await tx.user.update({ where: { id: lawyer.user.id }, data: { status: 'SUSPENDED' } });
      await this.audit.logWithin(tx, {
        action: AuditAction.LAWYER_REJECTED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'LawyerProfile',
        entityId: id,
        metadata: { barNumber: lawyer.barNumber, userId: lawyer.user.id, reason },
        ...meta,
      });
    });
    return {
      message: 'Lawyer request rejected. The account is now suspended.',
      lawyer: toItem(await this.load(id)),
    };
  }
}
