import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditAction, AuditService } from '../audit/audit.service';
import { Messages } from '../common/messages';
import { assertPhoneFree } from '../common/phone-check';
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

/** Per-account lockout: this many wrong passwords within the window lock the account for LOCK_MINUTES. */
const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer?: NodeJS.Timeout;
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
    // Identity first (CNIC/email), then the phone rule, so a duplicate account gets the identifier message.
    await assertPhoneFree(this.prisma, dto.phone);

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

  /** Revoked tokens are only needed until they would have expired: purge on startup and once a day. */
  onModuleInit() {
    void this.purgeRevokedTokens();
    this.purgeTimer = setInterval(() => void this.purgeRevokedTokens(), 24 * 60 * 60 * 1000);
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  private async purgeRevokedTokens() {
    try {
      await this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (error) {
      new Logger('AuthService').warn(`Could not purge revoked tokens: ${String(error)}`);
    }
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

    // A locked account is refused even with the right password until the lock expires.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        action: AuditAction.LOGIN_FAILURE,
        actorId: user.id,
        actorRole: user.role,
        success: false,
        metadata: { identifier, reason: 'account_locked' },
        ...meta,
      });
      throw new HttpException({ code: 'ACCOUNT_LOCKED', message: Messages.ACCOUNT_LOCKED }, 423);
    }

    // Chamber desk login: the Chamber ID must belong to this lawyer and the chamber licence must be active.
    let chamberOk = true;
    if (dto.chamberCode) {
      const chamber = user?.lawyerProfile
        ? await this.prisma.chamberProfile.findUnique({
            where: { lawyerId: user.lawyerProfile.id },
            select: { chamberCode: true, licenseStatus: true },
          })
        : null;
      chamberOk =
        user?.role === 'LAWYER' &&
        user.lawyerProfile?.verificationStatus === 'VERIFIED' &&
        chamber?.licenseStatus === 'ACTIVE' &&
        chamber.chamberCode.toLowerCase() === dto.chamberCode.toLowerCase();
    }

    if (!user || !passwordOk || user.status !== 'ACTIVE' || !chamberOk) {
      await this.audit.log({
        action: dto.chamberCode ? AuditAction.CHAMBER_LOGIN_FAILURE : AuditAction.LOGIN_FAILURE,
        actorId: user?.id,
        actorRole: user?.role,
        success: false,
        metadata: {
          identifier,
          reason: !user
            ? 'unknown_account'
            : !passwordOk
              ? 'bad_password'
              : !chamberOk
                ? 'chamber_mismatch'
                : 'inactive',
        },
        ...meta,
      });
      if (user && !passwordOk && (await this.recordFailedPassword(user.id, user.role, meta))) {
        throw new HttpException({ code: 'ACCOUNT_LOCKED', message: Messages.ACCOUNT_LOCKED }, 423);
      }
      throw new UnauthorizedException(
        dto.chamberCode ? Messages.CHAMBER_LOGIN_FAILED : Messages.LOGIN_FAILED,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        failedLoginWindowAt: null,
        lockedUntil: null,
      },
    });
    await this.audit.log({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorRole: user.role,
      entity: 'User',
      entityId: user.id,
      ...meta,
    });

    // jti lets logout revoke this one token; ims (issued-at in ms) is compared with sessionsInvalidatedAt.
    const token = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      jti: randomUUID(),
      ims: Date.now(),
    });
    return {
      message: dto.chamberCode ? Messages.CHAMBER_LOGIN_SUCCESS : Messages.LOGIN_SUCCESS,
      user: toPublicUser(user),
      token,
    };
  }

  /**
   * Counts a wrong password for an existing account. The fifth failure within LOCK_WINDOW_MINUTES locks the
   * account for LOCK_MINUTES (audited). Returns true when this failure locked the account.
   */
  private async recordFailedPassword(
    userId: string,
    role: Parameters<AuditService['log']>[0]['actorRole'],
    meta: RequestMeta,
  ): Promise<boolean> {
    const now = new Date();
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { failedLoginCount: true, failedLoginWindowAt: true },
    });
    const windowOpen =
      u.failedLoginWindowAt &&
      now.getTime() - u.failedLoginWindowAt.getTime() < LOCK_WINDOW_MINUTES * 60_000;
    const count = windowOpen ? u.failedLoginCount + 1 : 1;
    const lock = count >= LOCK_THRESHOLD;
    await this.prisma.user.update({
      where: { id: userId },
      data: lock
        ? {
            failedLoginCount: 0,
            failedLoginWindowAt: null,
            lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
          }
        : {
            failedLoginCount: count,
            failedLoginWindowAt: windowOpen ? u.failedLoginWindowAt : now,
          },
    });
    if (lock) {
      await this.audit.log({
        action: AuditAction.ACCOUNT_LOCKED,
        actorId: userId,
        actorRole: role,
        entity: 'User',
        entityId: userId,
        success: false,
        metadata: { failures: count, lockMinutes: LOCK_MINUTES },
        ...meta,
      });
    }
    return lock;
  }

  async logout(
    userId: string | undefined,
    role: Parameters<AuditService['log']>[0]['actorRole'],
    meta: RequestMeta,
    revoke?: { jti: string; exp: number },
  ) {
    // Only this token is revoked; the user's other devices stay signed in.
    if (revoke) {
      await this.prisma.revokedToken.upsert({
        where: { jti: revoke.jti },
        update: {},
        create: { jti: revoke.jti, userId, expiresAt: new Date(revoke.exp * 1000) },
      });
    }
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
    // A new password ends every existing session (tokens issued before now are refused by JwtStrategy).
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, sessionsInvalidatedAt: new Date() },
    });

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
