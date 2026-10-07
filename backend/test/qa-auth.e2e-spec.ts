/** QA: registration validation, account status and login, staff provisioning, lawyer verification gate. */
import { Api, anon, buildWorld, fileCase, login, PASSWORD, World } from './fixtures';
import { createTestApp, mailer, resetDatabase, TestContext, validRegistration } from './helpers';

describe('QA auth, accounts and lawyer verification (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
  });
  afterAll(() => ctx.app.close());

  describe('registration validation', () => {
    it.each([
      ['cnic', { cnic: '3630211111111' }],
      ['cnic', { cnic: '36302-111111-1' }],
      ['phone', { phone: '03001234567' }],
      ['phone', { phone: '+92 400 1234567' }],
      ['email', { email: 'not-an-email' }],
    ])('rejects an invalid %s', async (field, override) => {
      const res = await anon(ctx)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'v@qa.test', cnic: '36302-7777777-7', ...override }))
        .expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('rejects a weak password and a mismatched confirmation', async () => {
      await anon(ctx)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'weak@qa.test', cnic: '36302-7777771-1', password: 'short', confirmPassword: 'short' }))
        .expect(400);
      await anon(ctx)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'mm@qa.test', cnic: '36302-7777772-2', confirmPassword: 'Passw0rdOther' }))
        .expect(400);
    });
  });

  describe('account status', () => {
    it.each(['suspend', 'block', 'delete'] as const)(
      'a user who is "%s"-ed cannot log in, and reactivation restores access',
      async (action) => {
        const email = `status-${action}@qa.test`;
        await anon(ctx)
          .post('/api/auth/register')
          .send(validRegistration({ email, cnic: `36302-88888${['suspend', 'block', 'delete'].indexOf(action)}1-1` }))
          .expect(201);
        const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
        const before = await login(ctx, email);
        await admin.patch(`/api/admin/users/${u.id}/status`).send({ action }).expect(200);
        const res = await anon(ctx).post('/api/auth/login').send({ identifier: email, password: PASSWORD }).expect(401);
        expect(res.body.message).toBe('Invalid username or password.');
        // The old session no longer works either.
        expect([401, 403]).toContain((await before.get('/api/auth/me')).status);
        if (action !== 'delete') {
          await admin.patch(`/api/admin/users/${u.id}/status`).send({ action: 'reactivate' }).expect(200);
          await login(ctx, email);
        }
      },
    );

    it('an admin cannot act on their own account', async () => {
      const res = await admin.patch(`/api/admin/users/${w.ids.admin}/status`).send({ action: 'block' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('staff provisioning', () => {
    it('creates a judge with a one-time link that sets the password once', async () => {
      mailer.send.mockClear();
      const res = await admin
        .post('/api/admin/users')
        .send({
          role: 'JUDGE',
          firstName: 'New',
          lastName: 'Judge',
          cnic: '36302-6666666-6',
          email: 'newjudge@qa.test',
          phone: '+92 301 1234567',
          courtId: w.courtId,
          courtroomId: w.rooms.r2,
        })
        .expect(201);
      expect(res.body.message).toBe('Staff account created.');
      const token = new URL(res.body.resetLink).searchParams.get('token');
      expect(token).toBeTruthy();
      expect(mailer.send).toHaveBeenCalled();
      // No usable password until the link is used.
      await anon(ctx).post('/api/auth/login').send({ identifier: 'newjudge@qa.test', password: PASSWORD }).expect(401);
      await anon(ctx)
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewJudge1Pass', confirmPassword: 'NewJudge1Pass' })
        .expect(200);
      await login(ctx, 'newjudge@qa.test', 'NewJudge1Pass');
      await anon(ctx)
        .post('/api/auth/reset-password')
        .send({ token, password: 'Another1Pass', confirmPassword: 'Another1Pass' })
        .expect(400);
    });

    it('refuses self-service roles and duplicate identifiers', async () => {
      await admin
        .post('/api/admin/users')
        .send({ role: 'LITIGANT', firstName: 'A', lastName: 'B', cnic: '36302-6666661-1', email: 'x1@qa.test', phone: '+92 301 1234567' })
        .expect(400);
      const dup = await admin
        .post('/api/admin/users')
        .send({ role: 'ADMIN', firstName: 'A', lastName: 'B', cnic: '36302-6666662-2', email: 'judge@qa.test', phone: '+92 301 1234567' });
      expect(dup.status).toBe(409);
    });
  });

  describe('lawyer verification gate', () => {
    it('blocks filing until verified, then the mock Bar Council check and verification create the chamber', async () => {
      const pending = await login(ctx, w.emails.lawyerPending);
      const blocked = await pending
        .post('/api/cases')
        .field('data', JSON.stringify({ caseType: 'CIVIL_SUIT', reliefSought: 'x'.repeat(30), petitioners: [{ name: 'A B' }], respondents: [{ name: 'C D' }] }));
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toMatch(/^Your lawyer profile is pending verification\./);

      const profile = await ctx.prisma.lawyerProfile.findUniqueOrThrow({ where: { userId: w.ids.lawyerPending } });
      const check = await admin.post(`/api/admin/lawyers/${profile.id}/bar-check`).expect(200);
      expect(check.body.found).toBe(true);
      const ok = await admin.post(`/api/admin/lawyers/${profile.id}/verify`).expect(200);
      expect(ok.body.message).toBe('Lawyer verification process complete. Credentials locked.');
      const chamber = await ctx.prisma.chamberProfile.findUniqueOrThrow({ where: { lawyerId: profile.id } });
      expect(chamber.chamberCode).toMatch(/^CH-\d{6}$/);

      const after = await login(ctx, w.emails.lawyerPending);
      const filed = await fileCase(after);
      expect(filed.case.ucn).toMatch(/^DA-\d{4}-CIV-\d{6}$/);
      // A verified lawyer cannot be rejected.
      expect((await admin.post(`/api/admin/lawyers/${profile.id}/reject`).send({ reason: 'Too late to reject this one.' })).status).toBe(409);
    });
  });

  describe('chamber desk login', () => {
    it('accepts Chamber ID + email + password and refuses a wrong Chamber ID', async () => {
      const ok = await anon(ctx)
        .post('/api/auth/login')
        .send({ identifier: w.emails.lawyer, password: PASSWORD, chamberCode: w.chamberCode });
      expect(ok.status).toBe(200);
      const bad = await anon(ctx)
        .post('/api/auth/login')
        .send({ identifier: w.emails.lawyer, password: PASSWORD, chamberCode: 'CH-999999' })
        .expect(401);
      expect(bad.body.message).toBe('Authentication Failure: Check Chamber ID or security parameters.');
    });
  });
});
