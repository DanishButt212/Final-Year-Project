/** QA: schema safety nets, notifications and preferences, feedback, settings, security alerts, audit integrity, headers, reports. */
import { Api, anon, buildWorld, fileCase, login, PASSWORD, pdfOfSize, World } from './fixtures';
import { createTestApp, mailer, resetDatabase, TestContext, validRegistration } from './helpers';

describe('QA platform, security, audit and reports (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let litigant: Api;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
    litigant = await login(ctx, w.emails.litigant);
  });
  afterAll(() => ctx.app.close());

  describe('database safety nets', () => {
    it('has the audit trigger and the partial unique indexes', async () => {
      const trig = await ctx.prisma.$queryRaw<{ tgname: string }[]>`
        SELECT tgname FROM pg_trigger WHERE tgname = 'audit_log_no_update_delete'`;
      expect(trig).toHaveLength(1);
      const idx = await ctx.prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN
        ('Hearing_judge_slot_active_key','Hearing_courtroom_slot_active_key','SecurityAlert_open_actor_key','SecurityAlert_open_ip_key')`;
      expect(idx).toHaveLength(4);
      for (const i of idx) expect(i.indexdef).toMatch(/WHERE/);
    });

    it('refuses UPDATE and DELETE on AuditLog', async () => {
      await expect(ctx.prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'X'`)).rejects.toThrow();
      await expect(ctx.prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`)).rejects.toThrow();
    });
  });

  describe('notifications and preferences', () => {
    it('lists, marks one read and marks all read', async () => {
      await ctx.prisma.notification.createMany({
        data: [1, 2, 3].map((i) => ({ userId: w.ids.litigant, type: 'TEST', title: `T${i}`, body: 'b', channel: 'IN_APP' as const })),
      });
      const list = await litigant.get('/api/notifications').expect(200);
      expect(list.body.unreadCount).toBe(3);
      await litigant.patch(`/api/notifications/${list.body.data[0].id}/read`).expect(200);
      expect((await litigant.get('/api/notifications')).body.unreadCount).toBe(2);
      const other = await login(ctx, w.emails.litigant2);
      await other.patch(`/api/notifications/${list.body.data[1].id}/read`).expect(404);
      await litigant.post('/api/notifications/read-all').expect(201);
      expect((await litigant.get('/api/notifications')).body.unreadCount).toBe(0);
    });

    it('skips the e-mail channel when the user turned it off', async () => {
      await litigant.put('/api/users/me/notification-preferences').send({ sms: false, mobilePush: false, email: false }).expect(200);
      mailer.send.mockClear();
      const { case: c } = await fileCase(litigant);
      await ctx.prisma.case.update({ where: { id: c.id }, data: { status: 'DECIDED' } });
      // Trigger a notification through a real flow: a staff-side notice to this user.
      await ctx.app.get((await import('../src/notifications/notifications.service')).NotificationsService).notify(w.ids.litigant, {
        type: 'TEST',
        title: 'Preference check',
        body: 'Only in-app expected.',
      });
      expect(mailer.send).not.toHaveBeenCalled();
      await litigant.put('/api/users/me/notification-preferences').send({ sms: false, mobilePush: false, email: true }).expect(200);
    });
  });

  describe('feedback', () => {
    it('is submitted by a litigant and reviewed by an admin', async () => {
      await litigant.post('/api/feedback').send({ message: 'short', category: 'USABILITY' }).expect(400);
      const res = await litigant
        .post('/api/feedback')
        .send({ message: 'The filing wizard is clear and quick to use.', category: 'USABILITY', rating: 5 })
        .expect(201);
      expect(res.body.message).toBeTruthy();
      const list = await admin.get('/api/admin/feedback').expect(200);
      const id = list.body.data[0].id;
      await admin.patch(`/api/admin/feedback/${id}`).send({ status: 'PROCESSED' }).expect(200);
      await litigant.get('/api/admin/feedback').expect(403);
    });
  });

  describe('policy settings take effect', () => {
    it('changes the slot length on the scheduling board', async () => {
      await admin.put('/api/admin/settings').send({ hearingSlotMinutes: 60 }).expect(200);
      const b = await admin.get(`/api/admin/scheduling/board?courtId=${w.courtId}&date=2030-01-07`).expect(200);
      expect(b.body.slots).toHaveLength(5);
      await admin.put('/api/admin/settings').send({ hearingSlotMinutes: 30 }).expect(200);
    });

    it('changes the maximum attachment size for filing', async () => {
      await admin.put('/api/admin/settings').send({ maxAttachmentMb: 1 }).expect(200);
      const res = await litigant
        .post('/api/cases')
        .field('data', JSON.stringify({ caseType: 'CIVIL_SUIT', reliefSought: 'Recovery of money under the agreement.', petitioners: [{ name: 'Ayesha Siddiqui' }], respondents: [{ name: 'Bilal Ahmed' }] }))
        .attach('files', pdfOfSize(2 * 1024 * 1024), 'two-mb.pdf');
      expect(res.status).toBe(400);
      await admin.put('/api/admin/settings').send({ maxAttachmentMb: 25 }).expect(200);
    });

    it('changes the base fee used for new challans', async () => {
      await admin.put('/api/admin/settings').send({ fees: [{ caseType: 'WRIT_PETITION', amount: '750.00' }] }).expect(200);
      const { case: c } = await fileCase(litigant, { caseType: 'WRIT_PETITION' });
      const ch = await litigant.post(`/api/cases/${c.id}/challan`).expect(200);
      expect(ch.body.challan.amount).toBe('750.00');
    });

    it('rejects invalid policy values', async () => {
      await admin.put('/api/admin/settings').send({ hearingSlotMinutes: 7 }).expect(400);
      await admin.put('/api/admin/settings').send({ courtDayStart: '25:00' }).expect(400);
    });
  });

  describe('security alerts and privilege escalation', () => {
    it('raises an alert after 3 refused admin calls in 10 minutes, ends the session and records the block', async () => {
      await ctx.prisma.securityEvent.deleteMany();
      const intruder = await login(ctx, w.emails.litigant2);
      for (let i = 0; i < 3; i++) await intruder.get('/api/admin/users').expect(403);
      const alert = await ctx.prisma.securityAlert.findFirstOrThrow({ where: { actorId: w.ids.litigant2, status: 'OPEN' } });
      const killed = await intruder.get('/api/auth/me');
      expect(killed.status).toBe(401);
      expect(killed.body.message).toBe('Your session was ended for security reasons. Please sign in again.');
      const res = await admin.post(`/api/admin/security/alerts/${alert.id}/blacklist`).send({ reason: 'QA test' }).expect(201);
      expect(res.body.message).toBe('Privilege escalation neutralized. Host blocked.');
      // Loopback is recorded but never enforced.
      expect(res.body.note).toBe('Recorded, not enforced on local development hosts.');
      await login(ctx, w.emails.litigant2);
      await anon(ctx).get('/api/health').expect(200);
    });
  });

  describe('audit log', () => {
    it('writes hashed entries for important actions without secrets in the metadata', async () => {
      await anon(ctx)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'audit@qa.test', cnic: '36302-9191919-1' }))
        .expect(201);
      await anon(ctx).post('/api/auth/login').send({ identifier: 'audit@qa.test', password: 'wrong-Passw0rd' }).expect(401);
      const rows = await ctx.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      expect(rows.length).toBeGreaterThan(5);
      const recent = rows.filter((r) => r.eventHash);
      expect(recent.length).toBe(rows.length);
      for (const r of rows) expect(r.eventHash).toMatch(/^[0-9a-f]{64}$/);
      const text = JSON.stringify(rows.map((r) => r.metadata));
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('wrong-Passw0rd');
      expect(text.toLowerCase()).not.toContain('passwordhash');
    });

    it('detects a tampered row on integrity verification', async () => {
      const ok = await admin.get('/api/admin/audit-logs/verify').expect(200);
      expect(ok.body.mismatched).toBe(0);
      const victim = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'AUTH_REGISTER' } });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete`);
        await tx.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'AUTH_REGISTER_EDITED' WHERE id = $1`, victim.id);
        await tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete`);
      });
      const bad = await admin.get('/api/admin/audit-logs/verify').expect(200);
      expect(bad.body.mismatched).toBe(1);
      await expect(ctx.prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'X'`)).rejects.toThrow();
    });
  });

  describe('HTTP hardening', () => {
    it('sends helmet headers', async () => {
      const res = await anon(ctx).get('/api/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows the configured origin and refuses unknown origins', async () => {
      const allowed = await anon(ctx).get('/api/health').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const evil = await anon(ctx).get('/api/health').set('Origin', 'https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('reports', () => {
    const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric' }).format(new Date()));
    let code: string;
    let reportId: string;

    it('computes performance statistics', async () => {
      const res = await admin.get(`/api/admin/reports/performance?year=${year}&monthFrom=1&monthTo=12`).expect(200);
      expect(res.body).toHaveProperty('byCaseType');
      expect(res.body.byCaseType.find((r: { key: string }) => r.key === 'CIVIL_SUIT').filed).toBeGreaterThan(0);
      await litigant.get(`/api/admin/reports/performance?year=${year}&monthFrom=1&monthTo=12`).expect(403);
    });

    it.each(['PDF', 'EXCEL'])('exports a %s with an RPT code and a valid seal', async (format) => {
      const res = await admin
        .post('/api/admin/reports/export')
        .send({ kind: 'PERFORMANCE', format, params: { year, monthFrom: 1, monthTo: 12 } })
        .expect(201);
      code = res.headers['x-report-code'];
      expect(code).toMatch(new RegExp(`^RPT-${year}-\\d{6}$`));
      const row = await ctx.prisma.generatedReport.findUniqueOrThrow({ where: { code } });
      reportId = row.id;
      const v = await admin.post(`/api/admin/reports/${reportId}/verify`).expect(201);
      expect(v.body.status ?? v.body.result).toBe('valid');
    });

    it('refuses an audit export above 50,000 rows', async () => {
      await ctx.prisma.$executeRawUnsafe(`
        INSERT INTO "AuditLog" (id, action, "createdAt", success)
        SELECT gen_random_uuid()::text, 'QA_BULK', now(), true FROM generate_series(1, 50001)`);
      const res = await admin
        .post('/api/admin/reports/export')
        .send({ kind: 'AUDIT_TRAIL', format: 'EXCEL', params: { action: 'QA_BULK' } });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/^This audit trail has 50,001 rows\. Narrow the filters to at most 50,000 rows and try again\.$/);
    }, 120_000);
  });
});
