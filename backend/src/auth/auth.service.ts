import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { AuditAction, AuditService } from '../audit/audit.service';
import { Messages } from '../common/messages';
import { Prisma } from '../generated/prisma/client';
import { MockMailerService } from '../integrations/mock-mailer.service';
import { MockNadraService } from '../integrations/nadra/mock-nadra.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/user.mapper';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { RegisterDto } from './dto/register.dto';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private dummyHash?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly nadra: MockNadraService,
    private readonly mailer: MockMailerService,
  ) {}

  private get rounds(): number {
    return this.config.getOrThrow<number>('BCRYPT_ROUNDS');
  }

  async register(dto: RegisterDto, meta: RequestMeta) {
    const verification = this.nadra.verifyCnic(dto.cnic);
    if (!verification.verified) {
      throw new BadRequestException({
        code: 'CNIC_NOT_VERIFIED',
        message: Messages.CNIC_NOT_VERIFIED,
        details: [{ field: 'cnic', messages: [verification.reason ?? Messages.CNIC_NOT_VERIFIED] }],
      });
    }

    const barNumber = dto.role === 'LAWYER' && dto.barNumber ? dto.barNumber : undefined;
    const duplicate = await this.prisma.user.findFirst({
      where: { OR: [{ cnic: dto.cnic }, { email: dto.email }] },
      select: { id: true },
    });
    const barTaken = barNumber
      ? await this.prisma.lawyerProfile.findUnique({ where: { barNumber }, select: { id: true } })
      : null;
    if (duplicate || barTaken) throw this.duplicateError();

    const passwordHash = await bcrypt.hash(dto.password, this.rounds);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          cnic: dto.cnic,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          notificationPreference: { create: {} },
          ...(dto.role === 'LAWYER'
            ? { lawyerProfile: { create: { barNumber, verificationStatus: 'PENDING' } } }
            : {}),
        },
        include: { lawyerProfile: true },
      });
    } catch (error) {
      // Two simultaneous registrations can pass the checks above; the DB constraint is the final guard.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateError();
      }
      throw error;
    }

    await this.audit.log({
      action: AuditAction.REGISTER,
      actorId: user.id,
      actorRole: user.role,
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role, nadraReference: verification.reference },
      ...meta,
    });
    return { message: Messages.REGISTER_SUCCESS, user: toPublicUser(user) };
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const identifier = dto.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
      include: { lawyerProfile: true },
    });

    // Always run a bcrypt comparison so response time does not reveal whether the account exists.
    const hash =
      user?.passwordHash ??
      (this.dummyHash ??= bcrypt.hashSync('not-a-real-password', this.rounds));
    const passwordOk = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordOk || user.status !== 'ACTIVE') {
      await this.audit.log({
        action: AuditAction.LOGIN_FAILURE,
        actorId: user?.id,
        actorRole: user?.role,
        success: false,
        metadata: {
          identifier,
          reason: !user ? 'unknown_account' : !passwordOk ? 'bad_password' : 'inactive',
        },
        ...meta,
      });
      throw new UnauthorizedException(Messages.LOGIN_FAILED);
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorRole: user.role,
      entity: 'User',
      entityId: user.id,
      ...meta,
    });

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { message: Messages.LOGIN_SUCCESS, user: toPublicUser(user), token };
  }

  async logout(
    userId: string | undefined,
    role: Parameters<AuditService['log']>[0]['actorRole'],
    meta: RequestMeta,
  ) {
    await this.audit.log({
      action: AuditAction.LOGOUT,
      actorId: userId,
      actorRole: role,
      entity: 'User',
      entityId: userId,
      ...meta,
    });
    return { message: Messages.LOGOUT_SUCCESS };
  }

  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (user && user.status === 'ACTIVE') {
      const token = randomBytes(32).toString('hex');
      const ttl = this.config.getOrThrow<number>('RESET_TOKEN_TTL_MINUTES');
      await this.prisma.$transaction([
        // Only the newest link works.
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + ttl * 60_000),
          },
        }),
      ]);
      const origin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
      this.mailer.send(
        user.email,
        'Reset your DigitalAdaalat password',
        `Open this link to choose a new password (valid for ${ttl} minutes):\n${origin}/reset-password?token=${token}`,
      );
      await this.audit.log({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        actorId: user.id,
        actorRole: user.role,
        entity: 'User',
        entityId: user.id,
        ...meta,
      });
    }
    // Same answer whether or not the email is registered.
    return { message: Messages.FORGOT_PASSWORD_GENERIC };
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.user.status !== 'ACTIVE'
    ) {
      throw new BadRequestException({
        code: 'RESET_TOKEN_INVALID',
        message: Messages.RESET_INVALID,
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, this.rounds);
    // Single-use: the conditional update fails if another request consumed the token first.
    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException({
        code: 'RESET_TOKEN_INVALID',
        message: Messages.RESET_INVALID,
      });
    }
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });

    await this.audit.log({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      actorId: record.userId,
      actorRole: record.user.role,
      entity: 'User',
      entityId: record.userId,
      ...meta,
    });
    return { message: Messages.RESET_SUCCESS };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lawyerProfile: true },
    });
    if (!user) throw new UnauthorizedException(Messages.UNAUTHORIZED);
    return { user: toPublicUser(user) };
  }

  private duplicateError(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_IDENTIFIER',
      message: Messages.DUPLICATE_IDENTIFIER,
    });
  }
}
