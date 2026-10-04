import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AuditAction, AuditService } from '../audit/audit.service';
import { hashToken } from '../auth/auth.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { MockMailerService } from '../integrations/mock-mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestMeta } from './constants';
import {
  AdminListUsersQueryDto,
  CreateStaffDto,
  StatusAction,
  UpdateUserStatusDto,
} from './dto/admin.dto';

/** Provisioned accounts get a link valid for 72 hours (the admin hands it over in person). */
const PROVISION_LINK_HOURS = 72;

const userSelect = {
  id: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  cnic: true,
  phone: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  court: { select: { id: true, name: true } },
  courtroom: { select: { id: true, name: true } },
  lawyerProfile: { select: { barNumber: true, verificationStatus: true } },
} satisfies Prisma.UserSelect;

const conflict = (message: string, code: string) => new ConflictException({ code, message });

/** UC-2.1: global account management and registry control. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mailer: MockMailerService,
  ) {}

  async list(q: AdminListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { cnic: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return { data: rows, meta: pageMeta(q.page, q.limit, total) };
  }

  /** Creates INTERN, PROCESS_SERVER, JUDGE or ADMIN accounts. No password is ever chosen by the admin. */
  async provision(actor: AuthUser, dto: CreateStaffDto, meta: RequestMeta) {
    let courtId: string | null = null;
    let courtroomId: string | null = null;
    let serverCourtId: string | null = null;
    if (dto.role === 'JUDGE') {
      if (!dto.courtId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: Messages.INVALID_FIELDS,
          details: [{ field: 'courtId', messages: ['Choose the court this judge belongs to.'] }],
        });
      }
      courtId = dto.courtId;
    } else if (dto.role === 'PROCESS_SERVER') {
      const missing = (field: string, text: string) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: Messages.INVALID_FIELDS,
          details: [{ field, messages: [text] }],
        });
      if (!dto.badgeNumber) throw missing('badgeNumber', 'Enter the badge number.');
      if (!dto.courtId) throw missing('courtId', 'Choose the precinct court.');
      if (!dto.sector) throw missing('sector', 'Enter the assigned sector.');
      if (dto.courtroomId) throw missing('courtroomId', 'Process servers have no courtroom.');
      serverCourtId = dto.courtId;
      const court = await this.prisma.court.findFirst({
        where: { id: dto.courtId, isActive: true },
        select: { id: true },
      });
      if (!court) throw new NotFoundException(Messages.NOT_FOUND);
      const badge = await this.prisma.processServerProfile.findUnique({
        where: { badgeNumber: dto.badgeNumber },
        select: { id: true },
      });
      if (badge) throw missing('badgeNumber', 'This badge number is already in use.');
    } else if (dto.courtId || dto.courtroomId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [{ field: 'courtId', messages: ['Only judges are attached to a court.'] }],
      });
    }
    if (courtId) {
      const court = await this.prisma.court.findFirst({
        where: { id: courtId, isActive: true },
        select: { id: true },
      });
      if (!court) throw new NotFoundException(Messages.NOT_FOUND);
      if (dto.courtroomId) {
        const room = await this.prisma.courtroom.findFirst({
          where: { id: dto.courtroomId, courtId, isActive: true },
          select: { id: true },
        });
        if (!room) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: Messages.INVALID_FIELDS,
            details: [{ field: 'courtroomId', messages: ['This courtroom is not in that court.'] }],
          });
        }
        courtroomId = room.id;
      }
    }

    let supervisorId: string | null = null;
    if (dto.role === 'INTERN') {
      const sup = dto.supervisorLawyerId
        ? await this.prisma.lawyerProfile.findFirst({
            where: {
              id: dto.supervisorLawyerId,
              verificationStatus: 'VERIFIED',
              user: { status: 'ACTIVE' },
            },
            select: { id: true },
          })
        : null;
      if (!sup) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: Messages.INVALID_FIELDS,
          details: [
            {
              field: 'supervisorLawyerId',
              messages: ['Choose the verified lawyer who supervises this intern.'],
            },
          ],
        });
      }
      supervisorId = sup.id;
    } else if (dto.supervisorLawyerId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [
          { field: 'supervisorLawyerId', messages: ['Only interns have a supervising lawyer.'] },
        ],
      });
    }

    const duplicate = await this.prisma.user.findFirst({
      where: { OR: [{ cnic: dto.cnic }, { email: dto.email }] },
      select: { id: true },
    });
    if (duplicate) throw conflict(Messages.DUPLICATE_IDENTIFIER, 'DUPLICATE_IDENTIFIER');

    // Random, never-disclosed password: the person sets their own through the reset link.
    const rounds = this.config.getOrThrow<number>('BCRYPT_ROUNDS');
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), rounds);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PROVISION_LINK_HOURS * 3_600_000);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            role: dto.role,
            firstName: dto.firstName,
            lastName: dto.lastName,
            cnic: dto.cnic,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            courtId,
            courtroomId,
            notificationPreference: { create: {} },
            passwordResetTokens: { create: { tokenHash: hashToken(token), expiresAt } },
            ...(serverCourtId
              ? {
                  serverProfile: {
                    create: {
                      badgeNumber: dto.badgeNumber as string,
                      courtId: serverCourtId,
                      sector: dto.sector as string,
                      phone: dto.phone,
                    },
                  },
                }
              : {}),
            ...(supervisorId
              ? { internProfile: { create: { supervisorId, startDate: new Date() } } }
              : {}),
          },
          select: userSelect,
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.USER_PROVISIONED,
          actorId: actor.id,
          actorRole: actor.role,
          entity: 'User',
          entityId: created.id,
          metadata: { role: dto.role, courtId, supervisorId },
          ...meta,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict(Messages.DUPLICATE_IDENTIFIER, 'DUPLICATE_IDENTIFIER');
      }
      throw error;
    }

    const origin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
    const resetLink = `${origin}/reset-password?token=${token}`;
    this.mailer.send(
      user.email,
      'Your DigitalAdaalat account',
      `An account was created for you. Open this link to choose your password (valid ${PROVISION_LINK_HOURS} hours):\n${resetLink}`,
    );
    // The link is returned this once; only its hash is stored.
    return { message: 'Staff account created.', user, resetLink, expiresAt };
  }

  /** Suspend, block (revoke access), reactivate or soft-delete. Rows are never hard-deleted. */
  async changeStatus(actor: AuthUser, id: string, dto: UpdateUserStatusDto, meta: RequestMeta) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        lawyerProfile: { select: { verificationStatus: true } },
      },
    });
    if (!target) throw new NotFoundException(Messages.NOT_FOUND);

    const next = this.nextStatus(dto.action, target.status);
    const removesAccess = dto.action !== 'reactivate';

    if (removesAccess && target.id === actor.id) {
      throw conflict('You cannot suspend, block or delete your own account.', 'SELF_PROTECTION');
    }
    if (removesAccess && target.role === 'ADMIN' && target.status === 'ACTIVE') {
      const others = await this.prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', id: { not: target.id } },
      });
      if (others === 0) {
        throw conflict('The last active administrator cannot be removed.', 'LAST_ADMIN');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: next } });
      // A suspended, blocked or deleted lawyer suspends the chamber licence; reactivation restores it.
      await tx.processServerProfile.updateMany({
        where: { userId: id },
        data: { status: next === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' },
      });
      await tx.chamberProfile.updateMany({
        where: { lawyer: { userId: id } },
        data: { licenseStatus: next === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' },
      });
      // Reactivating a rejected lawyer sends the profile back to the approval queue.
      if (dto.action === 'reactivate' && target.lawyerProfile?.verificationStatus === 'REJECTED') {
        await tx.lawyerProfile.update({
          where: { userId: id },
          data: { verificationStatus: 'PENDING', rejectionReason: null },
        });
      }
      await this.audit.logWithin(tx, {
        action: AuditAction.USER_STATUS_CHANGED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'User',
        entityId: id,
        metadata: { action: dto.action, from: target.status, to: next },
        ...meta,
      });
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    return { message: Messages.USER_PERMISSIONS_UPDATED, user };
  }

  private nextStatus(action: StatusAction, current: UserStatus): UserStatus {
    const invalid = (text: string) => conflict(text, 'INVALID_STATUS_CHANGE');
    if (current === 'DEACTIVATED') throw invalid('A deleted account cannot be changed.');
    switch (action) {
      case 'suspend':
        if (current !== 'ACTIVE') throw invalid('Only an active account can be suspended.');
        return 'SUSPENDED';
      case 'block':
        if (current === 'BLOCKED') throw invalid('This account is already blocked.');
        return 'BLOCKED';
      case 'reactivate':
        if (current === 'ACTIVE') throw invalid('This account is already active.');
        return 'ACTIVE';
      case 'delete':
        return 'DEACTIVATED';
    }
  }
}
