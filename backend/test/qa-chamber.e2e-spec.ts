/** QA: chamber silo (clients, billable, retainers, alerts, expenses), interns, research logs, geo-fenced attendance, certificate. */
import { Api, buildWorld, fileCase, login, World } from './fixtures';
import { createTestApp, mailer, resetDatabase, TestContext } from './helpers';
import { anon } from './fixtures';

const INSIDE = { latitude: 30.1979, longitude: 71.4698, accuracy: 15 };
const OUTSIDE = { latitude: 30.26, longitude: 71.53, accuracy: 15 };
const NOTES = 'Section 9 CPC confers jurisdiction on civil courts; the bar on suits must be express or implied by statute.';

describe('QA chamber, interns and certificate (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let lawyer: Api;
  let lawyer2: Api;
  let intern: Api;
  let litigant: Api;
  let ucn: string;
  let clientId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    lawyer = await login(ctx, w.emails.lawyer);
    lawyer2 = await login(ctx, w.emails.lawyer2);
    intern = await login(ctx, w.emails.intern);
    litigant = await login(ctx, w.emails.litigant);
    ucn = (await fileCase(lawyer)).case.ucn; // the lawyer is counsel on this case
  });
  afterAll(() => ctx.app.close());

  describe('clients, billing and retainers', () => {
    it('numbers clients CL-000001 per chamber and rejects a duplicate CNIC', async () => {
      const res = await lawyer
        .post('/api/chamber/clients')
        .send({ name: 'Rashid Mehmood', cnic: '36302-5555555-5', phone: '+92 300 7654321', caseType: 'CIVIL_SUIT' })
        .expect(201);
      expect(res.body.message).toBe('New client profile cataloged inside chamber records.');
      expect(res.body.client.clientCode).toBe('CL-000001');
      clientId = res.body.client.id;
      const dup = await lawyer
        .post('/api/chamber/clients')
        .send({ name: 'Rashid Again', cnic: '36302-5555555-5', phone: '+92 300 7654321', caseType: 'CIVIL_SUIT' });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('Duplicate profile entry detected for this client ID.');
      // Another chamber starts its own sequence and cannot see this client.
      const other = await lawyer2
        .post('/api/chamber/clients')
        .send({ name: 'Other Client', cnic: '36302-5555555-5', phone: '+92 300 7654321', caseType: 'CIVIL_SUIT' })
        .expect(201);
      expect(other.body.client.clientCode).toBe('CL-000001');
      await lawyer2.get(`/api/chamber/clients/${clientId}`).expect(404);
    });

    it('records deposits and billable time, derives the balance and issues a low-balance alert', async () => {
      await lawyer.post(`/api/chamber/clients/${clientId}/retainer/deposit`).send({ amount: 30000 }).expect(200);
      const early = await lawyer.post(`/api/chamber/clients/${clientId}/low-balance-alert`);
      expect(early.status).toBe(409);
      expect(early.body.message).toBe('This client retainer is above the low balance threshold.');
      const bill = await lawyer
        .post('/api/chamber/billable')
        .send({ clientId, hours: 1.5, notes: 'Drafted the plaint and reviewed annexures.', chargeAgainstRetainer: true })
        .expect(201);
      expect(bill.body.message).toBe('Billable time unit recorded.');
      await lawyer.post('/api/chamber/billable').send({ clientId, hours: 0.3, notes: 'Bad step size here.' }).expect(400);
      const detail = await lawyer.get(`/api/chamber/clients/${clientId}`).expect(200);
      // 30,000 - 1.5 h x 15,000 = 7,500 -> below the 20,000 threshold.
      expect(detail.body.retainer.balance).toBe('7500.00');
      expect(detail.body.retainer.status).toBe('LOW');
      const alert = await lawyer.post(`/api/chamber/clients/${clientId}/low-balance-alert`).expect(200);
      expect(alert.body.message).toBe('Low balance alert issued to the client.');
    });

    it('records expenses', async () => {
      const res = await lawyer
        .post('/api/chamber/expenses')
        .send({ spentOn: new Date().toISOString().slice(0, 10), category: 'Court fees', amount: 1200, note: 'Stamp paper' })
        .expect(201);
      expect(res.body.message).toBe('Chamber expense recorded.');
      const list = await lawyer.get('/api/chamber/expenses').expect(200);
      expect(JSON.stringify(list.body)).toContain('1200');
    });
  });

  describe('interns and research logs', () => {
    let logId: string;

    it('lets the lawyer create an intern account with a one-time link', async () => {
      mailer.send.mockClear();
      const res = await lawyer
        .post('/api/chamber/interns')
        .send({ firstName: 'Zara', lastName: 'Intern', cnic: '36302-4545454-5', email: 'zara.intern@qa.test', phone: '+92 333 1234567', startDate: '2026-09-15' })
        .expect(201);
      expect(res.body.message).toBe('Intern account created.');
      expect(mailer.send).toHaveBeenCalled();
      await anon(ctx).post('/api/auth/login').send({ identifier: 'zara.intern@qa.test', password: 'Passw0rdTest' }).expect(401);
    });

    it('accepts a research log only for a case where the supervising lawyer is counsel', async () => {
      const otherUcn = (await fileCase(litigant)).case.ucn;
      const bad = await intern
        .post('/api/intern/research-logs')
        .send({ caseNumber: otherUcn, keywords: ['jurisdiction'], citation: 'PLD 2020 SC 1', notes: NOTES });
      expect(bad.status).toBe(400);
      const ok = await intern
        .post('/api/intern/research-logs')
        .send({ caseNumber: ucn, keywords: ['jurisdiction'], citation: 'PLD 2020 SC 1', notes: NOTES })
        .expect(201);
      expect(ok.body.message).toBe('Research log saved and linked to chamber files successfully.');
      logId = ok.body.log?.id ?? (await ctx.prisma.internDiaryEntry.findFirstOrThrow()).id;
    });

    it('keeps a log editable until it is approved', async () => {
      await intern
        .patch(`/api/intern/research-logs/${logId}`)
        .send({ caseNumber: ucn, keywords: ['jurisdiction', 'CPC'], citation: 'PLD 2020 SC 1', notes: NOTES })
        .expect(200);
      await lawyer2.patch(`/api/chamber/research-logs/${logId}/review`).send({ status: 'APPROVED' }).expect(404);
      await lawyer.patch(`/api/chamber/research-logs/${logId}/review`).send({ status: 'APPROVED', comment: 'Good work.' }).expect(200);
      const late = await intern
        .patch(`/api/intern/research-logs/${logId}`)
        .send({ caseNumber: ucn, keywords: ['changed'], citation: 'PLD 2020 SC 1', notes: NOTES });
      expect(late.status).toBe(409);
    });
  });

  describe('geo-fenced attendance', () => {
    it('rejects a check-in outside the court radius with the exact message', async () => {
      const res = await intern.post('/api/intern/attendance/check-in').send(OUTSIDE);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'Verification Failed: You must be physically inside the court complex boundaries to log attendance.',
      );
    });

    it('rejects a low-accuracy fix', async () => {
      const res = await intern.post('/api/intern/attendance/check-in').send({ ...INSIDE, accuracy: 900 });
      expect(res.status).toBe(422);
      expect(res.body.message).toBe('Location accuracy is too low. Move to an open area and try again.');
    });

    it('accepts a check-in inside the radius once per day, then a check-out', async () => {
      const res = await intern.post('/api/intern/attendance/check-in').send(INSIDE).expect(200);
      expect(res.body.message).toBe('Attendance logged successfully. Location verified.');
      const again = await intern.post('/api/intern/attendance/check-in').send(INSIDE);
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('Attendance for today has already been logged.');
      const out = await intern.post('/api/intern/attendance/check-out').send(INSIDE).expect(200);
      expect(out.body.message).toBe('Check-out logged. Location verified.');
    });
  });

  describe('completion certificate', () => {
    it('is issued once by the supervising lawyer, sealed, and visible only to that lawyer and the intern', async () => {
      const id = w.internProfileId;
      await lawyer2.get(`/api/chamber/interns/${id}/certificate`).expect(404);
      const info = await lawyer.get(`/api/chamber/interns/${id}/certificate`).expect(200);
      expect(info.body).toMatchObject({ eligible: true, approvedLogs: 1, certificate: null });
      const res = await lawyer.post(`/api/chamber/interns/${id}/certificate`).expect(201);
      expect(res.body.certificate.certificateNo).toMatch(/^CERT-\d{4}-\d{6}$/);
      expect(res.body.certificate).toMatchObject({ approvedLogs: 1, attendanceDays: 1 });
      const twice = await lawyer.post(`/api/chamber/interns/${id}/certificate`);
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('A certificate has already been issued for this intern.');

      const mine = await intern.get('/api/intern/certificate').expect(200);
      expect(mine.body.certificate.certificateNo).toBe(res.body.certificate.certificateNo);
      const pdf = await intern.get('/api/intern/certificate/pdf').expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((await intern.post('/api/intern/certificate/verify').expect(200)).body.valid).toBe(true);
      expect((await lawyer.post(`/api/chamber/interns/${id}/certificate/verify`).expect(200)).body.valid).toBe(true);
      await lawyer2.get(`/api/chamber/interns/${id}/certificate/pdf`).expect(404);
      await litigant.get('/api/intern/certificate').expect(403);

      // Tampering with the stored record breaks the seal.
      await ctx.prisma.internCertificate.update({ where: { internId: id }, data: { approvedLogs: 99 } });
      const v = await intern.post('/api/intern/certificate/verify').expect(200);
      expect(v.body.valid).toBe(false);
      const notice = await ctx.prisma.notification.findFirst({ where: { userId: w.ids.intern, type: 'CERTIFICATE_ISSUED' } });
      expect(notice).not.toBeNull();
      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'CHAMBER_INTERN_CERTIFICATE_ISSUED' } });
      expect(audit?.eventHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is refused without an approved research log', async () => {
      const z = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'zara.intern@qa.test' }, include: { internProfile: true } });
      const res = await lawyer.post(`/api/chamber/interns/${z.internProfile!.id}/certificate`);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('A certificate can be issued once the intern has at least one approved research log.');
    });
  });
});
