import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto, NotificationPreferencesDto, UpdateProfileDto } from './dto/users.dto';
import { toPublicUser } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lawyerProfile: true },
    });
    if (!user) throw new NotFoundException(Messages.NOT_FOUND);
    return { user: toPublicUser(user) };
  }

  async updateMe(
    actor: AuthUser,
    dto: UpdateProfileDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.profileImage !== undefined) data.profileImage = dto.profileImage;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [{ field: 'phone', messages: ['Provide a phone number or a profile image.'] }],
      });
    }

    const user = await this.prisma.user.update({
      where: { id: actor.id },
      data,
      include: { lawyerProfile: true },
    });
    await this.audit.log({
      action: AuditAction.PROFILE_UPDATED,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'User',
      entityId: actor.id,
      metadata: { fields: Object.keys(data) },
      ...meta,
    });
    return { message: Messages.PROFILE_UPDATED, user: toPublicUser(user) };
  }

  async getPreferences(userId: string) {
    const p = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    // Defaults when nothing was saved yet: email on, SMS and mobile off.
    return {
      sms: p?.smsEnabled ?? false,
      mobilePush: p?.pushEnabled ?? false,
      email: p?.emailEnabled ?? true,
      inApp: true,
    };
  }

  async savePreferences(
    actor: AuthUser,
    dto: NotificationPreferencesDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.prisma.notificationPreference.upsert({
      where: { userId: actor.id },
      update: { smsEnabled: dto.sms, pushEnabled: dto.mobilePush, emailEnabled: dto.email },
      create: {
        userId: actor.id,
        smsEnabled: dto.sms,
        pushEnabled: dto.mobilePush,
        emailEnabled: dto.email,
      },
    });
    await this.audit.log({
      action: AuditAction.NOTIFICATION_PREFERENCES_SAVED,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'User',
      entityId: actor.id,
      metadata: { sms: dto.sms, mobilePush: dto.mobilePush, email: dto.email },
      ...meta,
    });
    return {
      message: 'Notification Preferences Saved.',
      preferences: await this.getPreferences(actor.id),
    };
  }

  async list(query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { cnic: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { lawyerProfile: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map(toPublicUser),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }
}
