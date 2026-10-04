import request from 'supertest';
import { Messages } from '../src/common/messages';
import {
  createTestApp,
  createUser,
  mailer,
  resetDatabase,
  TestContext,
  validRegistration,
} from './helpers';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    mailer.send.mockClear();
  });

  describe('POST /api/auth/register', () => {
    it('registers a litigant', async () => {
      const res = await http().post('/api/auth/register').send(validRegistration()).expect(201);
      expect(res.body.message).toBe(Messages.REGISTER_SUCCESS);
      expect(res.body.user).toMatchObject({
        role: 'LITIGANT',
        email: 'ayesha@example.test',
        status: 'ACTIVE',
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      const stored = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'ayesha@example.test' },
      });
      expect(stored.passwordHash).not.toContain('Passw0rdTest');
      expect(await ctx.prisma.notificationPreference.count({ where: { userId: stored.id } })).toBe(
        1,
      );
    });

    it('registers a lawyer with a PENDING lawyer profile', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send(
          validRegistration({
            role: 'LAWYER',
            barNumber: 'LHC-2020-1234',
            email: 'lawyer@example.test',
            cnic: '36302-2222222-2',
          }),
        )
        .expect(201);
      expect(res.body.user.lawyerProfile).toEqual({
        barNumber: 'LHC-2020-1234',
        verificationStatus: 'PENDING',
      });
    });

    it('writes an audit log entry', async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
      expect(
        await ctx.prisma.auditLog.count({ where: { action: 'AUTH_REGISTER', success: true } }),
      ).toBe(1);
    });

    it('rejects missing fields with the required message', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ role: 'LITIGANT', email: 'x@example.test' })
        .expect(400);
      expect(res.body.message).toBe(Messages.MISSING_FIELDS);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(
        expect.arrayContaining([
          'firstName',
          'lastName',
          'cnic',
          'phone',
          'password',
          'confirmPassword',
        ]),
      );
    });

    it.each([
      ['cnic', { cnic: '3630211111111' }],
      ['phone', { phone: '03001111111' }],
      ['email', { email: 'not-an-email' }],
      ['password', { password: 'short', confirmPassword: 'short' }],
      ['confirmPassword', { confirmPassword: 'Different1Password' }],
    ])('rejects an invalid %s', async (field, override) => {
      const res = await http()
        .post('/api/auth/register')
        .send(validRegistration(override))
        .expect(400);
      expect(res.body.message).toBe(Messages.INVALID_FIELDS);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('does not allow self-registration of privileged roles', async () => {
      for (const role of ['ADMIN', 'JUDGE', 'INTERN', 'PROCESS_SERVER']) {
        await http().post('/api/auth/register').send(validRegistration({ role })).expect(400);
      }
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('rejects unknown properties', async () => {
      await http()
        .post('/api/auth/register')
        .send(validRegistration({ status: 'ACTIVE' }))
        .expect(400);
    });

    it('rejects a duplicate CNIC', async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
      const res = await http()
        .post('/api/auth/register')
        .send(validRegistration({ email: 'other@example.test' }))
        .expect(409);
      expect(res.body.message).toBe(Messages.DUPLICATE_IDENTIFIER);
    });

    it('rejects a duplicate email, ignoring letter case', async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
      const res = await http()
        .post('/api/auth/register')
        .send(validRegistration({ cnic: '36302-3333333-3', email: 'AYESHA@Example.test' }))
        .expect(409);
      expect(res.body.message).toBe(Messages.DUPLICATE_IDENTIFIER);
    });

    it('rejects a CNIC the mock NADRA service cannot find', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send(validRegistration({ cnic: '00000-0000000-0' }))
        .expect(400);
      expect(res.body.code).toBe('CNIC_NOT_VERIFIED');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
    });

    it('logs in and sets an httpOnly SameSite=Lax cookie', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(200);
      expect(res.body.message).toBe(Messages.LOGIN_SUCCESS);
      expect(res.body.user.email).toBe('ayesha@example.test');
      expect(res.body.accessToken).toBeUndefined();
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('da_token='),
      );
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Secure/i); // Secure is only set in production
    });

    it('accepts a Bearer token (mobile clients ask for it with X-Client: mobile)', async () => {
      const login = await http()
        .post('/api/auth/login')
        .set('X-Client', 'mobile')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(200);
      const me = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(me.body.user.email).toBe('ayesha@example.test');
    });

    it('is case-insensitive for the email', async () => {
      await http()
        .post('/api/auth/login')
        .send({ identifier: 'AYESHA@example.test', password: 'Passw0rdTest' })
        .expect(200);
    });

    it('lets an admin log in with a username', async () => {
      await createUser(ctx.prisma, {
        role: 'ADMIN',
        email: 'admin@example.test',
        cnic: '36302-9999999-9',
        password: 'AdminPass1',
        username: 'registrar',
      });
      const res = await http()
        .post('/api/auth/login')
        .send({ identifier: 'registrar', password: 'AdminPass1' })
        .expect(200);
      expect(res.body.user.role).toBe('ADMIN');
    });

    it('gives the same generic failure for a wrong password and an unknown account', async () => {
      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'WrongPass1' })
        .expect(401);
      const unknown = await http()
        .post('/api/auth/login')
        .send({ identifier: 'nobody@example.test', password: 'WrongPass1' })
        .expect(401);
      expect(wrongPassword.body.message).toBe(Messages.LOGIN_FAILED);
      expect(unknown.body.message).toBe(Messages.LOGIN_FAILED);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a suspended account', async () => {
      await ctx.prisma.user.update({
        where: { email: 'ayesha@example.test' },
        data: { status: 'SUSPENDED' },
      });
      await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(401);
    });

    it('requires both fields', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test' })
        .expect(400);
      expect(res.body.message).toBe(Messages.MISSING_FIELDS);
    });

    it('audits both success and failure', async () => {
      await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(200);
      await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'WrongPass1' })
        .expect(401);
      expect(
        await ctx.prisma.auditLog.count({ where: { action: 'AUTH_LOGIN_SUCCESS', success: true } }),
      ).toBe(1);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: 'AUTH_LOGIN_FAILURE', success: false },
        }),
      ).toBe(1);
    });
  });

  describe('GET /api/auth/me and logout', () => {
    it('requires authentication', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(res.body.message).toBe(Messages.UNAUTHORIZED);
    });

    it('returns the user for a valid session, and logout ends it', async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
      const agent = request.agent(ctx.app.getHttpServer());
      await agent
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(200);
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.user.email).toBe('ayesha@example.test');
      expect(me.body.user.passwordHash).toBeUndefined();

      const out = await agent.post('/api/auth/logout').expect(200);
      expect(out.body.message).toBe(Messages.LOGOUT_SUCCESS);
      await agent.get('/api/auth/me').expect(401);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'AUTH_LOGOUT' } })).toBe(1);
    });

    it('rejects a tampered token', async () => {
      await http().get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });
  });

  describe('forgot and reset password', () => {
    const tokenFromMail = () => {
      const body = mailer.send.mock.calls[0][2] as string;
      return /token=([a-f0-9]+)/.exec(body)![1];
    };

    beforeEach(async () => {
      await http().post('/api/auth/register').send(validRegistration()).expect(201);
    });

    it('answers identically for registered and unknown emails', async () => {
      const known = await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      const unknown = await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.test' })
        .expect(200);
      expect(known.body).toEqual(unknown.body);
      expect(known.body.message).toBe(Messages.FORGOT_PASSWORD_GENERIC);
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });

    it('stores only a hash of the token, with a 1 hour expiry', async () => {
      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      const token = tokenFromMail();
      const rows = await ctx.prisma.passwordResetToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      const minutes = (rows[0].expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(58);
      expect(minutes).toBeLessThanOrEqual(60);
    });

    it('resets the password once; the old password stops working and the link cannot be reused', async () => {
      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      const token = tokenFromMail();
      const body = { token, password: 'BrandNew1Pass', confirmPassword: 'BrandNew1Pass' };

      const res = await http().post('/api/auth/reset-password').send(body).expect(200);
      expect(res.body.message).toBe(Messages.RESET_SUCCESS);

      await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'Passw0rdTest' })
        .expect(401);
      await http()
        .post('/api/auth/login')
        .send({ identifier: 'ayesha@example.test', password: 'BrandNew1Pass' })
        .expect(200);

      const reuse = await http().post('/api/auth/reset-password').send(body).expect(400);
      expect(reuse.body.message).toBe(Messages.RESET_INVALID);
      expect(
        await ctx.prisma.auditLog.count({ where: { action: 'AUTH_PASSWORD_RESET_COMPLETED' } }),
      ).toBe(1);
    });

    it('rejects an expired token', async () => {
      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      await ctx.prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http()
        .post('/api/auth/reset-password')
        .send({
          token: tokenFromMail(),
          password: 'BrandNew1Pass',
          confirmPassword: 'BrandNew1Pass',
        })
        .expect(400);
      expect(res.body.message).toBe(Messages.RESET_INVALID);
    });

    it('rejects an unknown token and mismatching passwords', async () => {
      await http()
        .post('/api/auth/reset-password')
        .send({ token: 'deadbeef', password: 'BrandNew1Pass', confirmPassword: 'BrandNew1Pass' })
        .expect(400);
      await http()
        .post('/api/auth/reset-password')
        .send({ token: 'deadbeef', password: 'BrandNew1Pass', confirmPassword: 'Other1Password' })
        .expect(400);
    });

    it('only the newest link works', async () => {
      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      const first = tokenFromMail();
      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ayesha@example.test' })
        .expect(200);
      await http()
        .post('/api/auth/reset-password')
        .send({ token: first, password: 'BrandNew1Pass', confirmPassword: 'BrandNew1Pass' })
        .expect(400);
    });
  });

  describe('rate limiting', () => {
    let limited: TestContext;
    beforeAll(async () => {
      process.env.ENABLE_THROTTLE_IN_TEST = 'true';
      process.env.AUTH_THROTTLE_LIMIT = '3';
      limited = await createTestApp();
    });
    afterAll(async () => {
      await limited.app.close();
      delete process.env.ENABLE_THROTTLE_IN_TEST;
      delete process.env.AUTH_THROTTLE_LIMIT;
    });

    it('returns 429 after too many login attempts', async () => {
      const server = limited.app.getHttpServer();
      const attempt = () =>
        request(server)
          .post('/api/auth/login')
          .send({ identifier: 'a@example.test', password: 'x' });
      for (let i = 0; i < 3; i++) await attempt().expect(401);
      const res = await attempt().expect(429);
      expect(res.body.message).toBe(Messages.TOO_MANY_REQUESTS);
    });
  });
});
