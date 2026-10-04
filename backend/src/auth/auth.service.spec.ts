import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Messages } from '../common/messages';
import { AuthService, hashToken } from './auth.service';

type Mock = jest.Mock;

function build() {
  const prisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    lawyerProfile: { findUnique: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
  const config = {
    getOrThrow: (key: string) =>
      ({ BCRYPT_ROUNDS: 4, RESET_TOKEN_TTL_MINUTES: 60, FRONTEND_ORIGIN: 'http://localhost:5173' })[
        key
      ],
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const nadra = {
    verifyCnic: jest.fn().mockReturnValue({ verified: true, reference: 'NADRA-MOCK-1' }),
  };
  const mailer = { send: jest.fn() };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    audit as never,
    nadra as never,
    mailer as never,
  );
  return { service, prisma, jwt, audit, nadra, mailer };
}

const registerDto = {
  role: 'LITIGANT' as const,
  firstName: 'Ayesha',
  lastName: 'Siddiqui',
  cnic: '36302-1111111-1',
  email: 'ayesha@example.test',
  phone: '+92 300 1111111',
  password: 'Passw0rdTest',
  confirmPassword: 'Passw0rdTest',
};

describe('AuthService', () => {
  describe('register', () => {
    it('rejects duplicates with the required message', async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.register(registerDto, {})).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto, {})).rejects.toMatchObject({
        response: { message: Messages.DUPLICATE_IDENTIFIER },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a CNIC that NADRA (mock) cannot verify', async () => {
      const { service, nadra, prisma } = build();
      nadra.verifyCnic.mockReturnValue({ verified: false, reference: 'x', reason: 'not found' });
      await expect(service.register(registerDto, {})).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password and creates a PENDING lawyer profile for lawyers', async () => {
      const { service, prisma, audit } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.lawyerProfile.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'u1',
        ...data,
        lawyerProfile: { barNumber: 'B-1', verificationStatus: 'PENDING' },
      }));

      const res = await service.register({ ...registerDto, role: 'LAWYER', barNumber: 'B-1' }, {});

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe('Passw0rdTest');
      expect(await bcrypt.compare('Passw0rdTest', data.passwordHash)).toBe(true);
      expect(data.lawyerProfile.create.verificationStatus).toBe('PENDING');
      expect(res.message).toBe(Messages.REGISTER_SUCCESS);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_REGISTER' }));
    });

    it('ignores a bar number sent by a litigant', async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({ id: 'u1', ...data }));
      await service.register({ ...registerDto, barNumber: 'B-9' }, {});
      expect(prisma.lawyerProfile.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create.mock.calls[0][0].data.lawyerProfile).toBeUndefined();
    });
  });

  describe('login', () => {
    it('fails identically for an unknown account and a wrong password, and audits both', async () => {
      const { service, prisma, audit } = build();
      prisma.user.findFirst.mockResolvedValueOnce(null);
      const unknown = await service
        .login({ identifier: 'a@b.test', password: 'x' }, {})
        .catch((e) => e);

      const passwordHash = await bcrypt.hash('RightPass1', 4);
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        role: 'LITIGANT',
        status: 'ACTIVE',
        passwordHash,
      });
      const wrong = await service
        .login({ identifier: 'a@b.test', password: 'WrongPass1' }, {})
        .catch((e) => e);

      for (const error of [unknown, wrong]) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.getResponse().message).toBe(Messages.LOGIN_FAILED);
      }
      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_FAILURE', success: false }),
      );
    });

    it('returns a token and the success message for valid credentials', async () => {
      const { service, prisma, jwt } = build();
      const passwordHash = await bcrypt.hash('RightPass1', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        role: 'JUDGE',
        status: 'ACTIVE',
        passwordHash,
        email: 'j@x.test',
      });
      const res = await service.login({ identifier: 'J@X.test', password: 'RightPass1' }, {});
      expect(res.message).toBe(Messages.LOGIN_SUCCESS);
      expect(res.token).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', role: 'JUDGE' });
      expect(JSON.stringify(res.user)).not.toContain('passwordHash');
    });

    it('refuses inactive accounts even with the right password', async () => {
      const { service, prisma } = build();
      const passwordHash = await bcrypt.hash('RightPass1', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        role: 'JUDGE',
        status: 'SUSPENDED',
        passwordHash,
      });
      await expect(
        service.login({ identifier: 'j@x.test', password: 'RightPass1' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('does not send mail or touch tokens for an unknown email, but answers the same', async () => {
      const { service, prisma, mailer } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await service.forgotPassword({ email: 'ghost@x.test' }, {});
      expect(res.message).toBe(Messages.FORGOT_PASSWORD_GENERIC);
      expect(mailer.send).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('emails a link whose token is stored only as a hash', async () => {
      const { service, prisma, mailer } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@x.test',
        status: 'ACTIVE',
        role: 'LITIGANT',
      });
      await service.forgotPassword({ email: 'a@x.test' }, {});
      const body = mailer.send.mock.calls[0][2] as string;
      const token = /token=([a-f0-9]{64})/.exec(body)![1];
      const stored = (prisma.passwordResetToken.create as Mock).mock.calls[0][0].data;
      expect(stored.tokenHash).toBe(hashToken(token));
      expect(stored.tokenHash).not.toBe(token);
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'abc', password: 'BrandNew1Pass', confirmPassword: 'BrandNew1Pass' };

    it.each([
      ['unknown', null],
      [
        'used',
        {
          id: 't',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 1e6),
          user: { status: 'ACTIVE' },
        },
      ],
      [
        'expired',
        {
          id: 't',
          usedAt: null,
          expiresAt: new Date(Date.now() - 1e3),
          user: { status: 'ACTIVE' },
        },
      ],
    ])('rejects a %s token', async (_name, record) => {
      const { service, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue(record);
      await expect(service.resetPassword(dto, {})).rejects.toMatchObject({
        response: { message: Messages.RESET_INVALID },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when another request consumed the token first', async () => {
      const { service, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        user: { status: 'ACTIVE', role: 'LITIGANT' },
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resetPassword(dto, {})).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the password hash on a valid token', async () => {
      const { service, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
        user: { status: 'ACTIVE', role: 'LITIGANT' },
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.resetPassword(dto, {});
      expect(res.message).toBe(Messages.RESET_SUCCESS);
      const newHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('BrandNew1Pass', newHash)).toBe(true);
    });
  });
});
