import request from 'supertest';
import { Messages } from '../src/common/messages';
import {
  createTestApp,
  createUser,
  resetDatabase,
  TestContext,
  validRegistration,
} from './helpers';

describe('Users and RBAC (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  const login = async (identifier: string, password: string) => {
    const agent = request.agent(ctx.app.getHttpServer());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await http().post('/api/auth/register').send(validRegistration()).expect(201);
    await createUser(ctx.prisma, {
      role: 'ADMIN',
      email: 'admin@example.test',
      cnic: '36302-9999999-9',
      password: 'AdminPass1',
      username: 'registrar',
    });
  });

  describe('GET /api/users (ADMIN only)', () => {
    it('returns 401 without a session', async () => {
      await http().get('/api/users').expect(401);
    });

    it('returns 403 for a litigant', async () => {
      const agent = await login('ayesha@example.test', 'Passw0rdTest');
      const res = await agent.get('/api/users').expect(403);
      expect(res.body.message).toBe(Messages.FORBIDDEN);
    });

    it('returns 403 for a lawyer', async () => {
      await http()
        .post('/api/auth/register')
        .send(
          validRegistration({
            role: 'LAWYER',
            email: 'lawyer@example.test',
            cnic: '36302-2222222-2',
          }),
        )
        .expect(201);
      const agent = await login('lawyer@example.test', 'Passw0rdTest');
      await agent.get('/api/users').expect(403);
    });

    it('returns a paginated list for an admin, without password hashes', async () => {
      const agent = await login('registrar', 'AdminPass1');
      const res = await agent.get('/api/users?page=1&limit=1').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('filters by role and search', async () => {
      const agent = await login('registrar', 'AdminPass1');
      const byRole = await agent.get('/api/users?role=LITIGANT').expect(200);
      expect(byRole.body.data.map((u: { role: string }) => u.role)).toEqual(['LITIGANT']);
      const bySearch = await agent.get('/api/users?search=siddiqui').expect(200);
      expect(bySearch.body.meta.total).toBe(1);
    });

    it('rejects invalid pagination', async () => {
      const agent = await login('registrar', 'AdminPass1');
      await agent.get('/api/users?limit=1000').expect(400);
    });
  });

  describe('/api/users/me', () => {
    it('returns the profile', async () => {
      const agent = await login('ayesha@example.test', 'Passw0rdTest');
      const res = await agent.get('/api/users/me').expect(200);
      expect(res.body.user.cnic).toBe('36302-1111111-1');
    });

    it('updates phone and profile image', async () => {
      const agent = await login('ayesha@example.test', 'Passw0rdTest');
      const res = await agent
        .patch('/api/users/me')
        .send({ phone: '+92 321 7654321', profileImage: 'https://example.test/me.png' })
        .expect(200);
      expect(res.body.message).toBe(Messages.PROFILE_UPDATED);
      expect(res.body.user.phone).toBe('+92 321 7654321');
      expect(await ctx.prisma.auditLog.count({ where: { action: 'USER_PROFILE_UPDATED' } })).toBe(
        1,
      );
    });

    it('rejects an invalid phone with the highlight message', async () => {
      const agent = await login('ayesha@example.test', 'Passw0rdTest');
      const res = await agent.patch('/api/users/me').send({ phone: '12345' }).expect(400);
      expect(res.body.message).toBe(Messages.INVALID_FIELDS);
      expect(res.body.details[0].field).toBe('phone');
    });

    it('rejects an empty update and attempts to change protected fields', async () => {
      const agent = await login('ayesha@example.test', 'Passw0rdTest');
      await agent.patch('/api/users/me').send({}).expect(400);
      await agent.patch('/api/users/me').send({ role: 'ADMIN' }).expect(400);
      await agent.patch('/api/users/me').send({ email: 'new@example.test' }).expect(400);
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'ayesha@example.test' },
      });
      expect(user.role).toBe('LITIGANT');
    });

    it('requires authentication', async () => {
      await http().patch('/api/users/me').send({ phone: '+92 321 7654321' }).expect(401);
    });
  });

  describe('audit log is append-only at database level', () => {
    it('rejects UPDATE and DELETE', async () => {
      await login('ayesha@example.test', 'Passw0rdTest');
      const entry = await ctx.prisma.auditLog.findFirstOrThrow();
      const before = await ctx.prisma.auditLog.count();
      // The pg adapter maps the trigger's SQLSTATE to a generic message, so assert on the effect.
      await expect(
        ctx.prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'TAMPERED' } }),
      ).rejects.toThrow();
      await expect(ctx.prisma.auditLog.deleteMany({})).rejects.toThrow();
      expect(await ctx.prisma.auditLog.count()).toBe(before);
      expect(
        (await ctx.prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).action,
      ).toBe(entry.action);
    });
  });

  describe('health', () => {
    it('is public and reports the database', async () => {
      const res = await http().get('/api/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    });
  });
});
