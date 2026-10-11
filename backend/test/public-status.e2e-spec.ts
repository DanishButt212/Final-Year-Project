/**
 * UX Upgrade A4: public case status (no login). Proves that only non-sensitive progress is ever returned,
 * that unknown and malformed UCNs leak nothing, that repeated failures are recorded and that throttling works.
 */
import request from 'supertest';
import { Messages } from '../src/common/messages';
import {
  allocateDirect,
  anon,
  Api,
  buildWorld,
  fileCase,
  login,
  workingDay,
  World,
} from './fixtures';
import { createTestApp, pdfBuffer, resetDatabase, TestContext } from './helpers';

const NOT_FOUND = 'No case found with this UCN.';
const ALLOWED_TOP = ['caseType', 'court', 'filingDate', 'nextHearing', 'progress', 'stage', 'ucn'];
const ALLOWED_HEARING = [
  'courtroom',
  'date',
  'endTime',
  'isVirtual',
  'published',
  'startTime',
  'timeSlot',
];

describe('Public case status (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let lawyer: Api;
  let caseId: string;
  let ucn: string;
  const day = workingDay(3);
  const lookup = (u: string) =>
    anon(ctx).get(`/api/public/cases/status?ucn=${encodeURIComponent(u)}`);

  /** Every personal or sensitive value attached to the case; none may appear anywhere in a response. */
  const secrets: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
    lawyer = await login(ctx, w.emails.lawyer);

    const filed = await fileCase(
      lawyer,
      {
        caseType: 'CIVIL_SUIT',
        claimAmountPkr: 750000,
        petitioners: [
          {
            name: 'Zainab Petitioner',
            cnic: '36302-7777777-1',
            phone: '+92 301 7777777',
            address: 'House 9, Bosan Road, Multan',
          },
        ],
        respondents: [
          { name: 'Kamran Respondent', cnic: '36302-8888888-2', phone: '+92 302 8888888' },
        ],
      },
      [{ name: 'secret-plaint.pdf', content: pdfBuffer('public-status') }],
    );
    caseId = filed.case.id;
    ucn = filed.case.ucn;

    // Fee paid, then allocated, then a hearing booked, plus a summons and an evidence row.
    const ch = await lawyer.post(`/api/cases/${caseId}/challan`);
    expect([200, 201]).toContain(ch.status);
    const co = await lawyer.post('/api/payments/checkout').send({ challanId: ch.body.challan.id });
    const paid = await lawyer.post('/api/mock-gateway/authorize').send({
      paymentId: co.body.paymentId,
      cardholderName: 'Card Holder Secret',
      cardNumber: '4242 4242 4242 4242',
      expiry: '12/30',
      cvv: '123',
    });
    expect(paid.status).toBe(200);
    await allocateDirect(ctx.prisma, caseId, w);
    await admin
      .post('/api/admin/hearings')
      .send({ caseId, courtroomId: w.rooms.r1, date: day, slot: 2 })
      .expect(201);
    await admin
      .post('/api/admin/summons')
      .send({
        caseId,
        noticeType: 'SUMMONS',
        recipientName: 'Kamran Respondent',
        serviceAddress: 'Plot 44, Secret Street, Multan',
        sector: 'Gulgasht',
        priority: 'NORMAL',
      })
      .expect(201);

    const judge = await ctx.prisma.user.findUniqueOrThrow({ where: { id: w.ids.judge } });
    const lawyerUser = await ctx.prisma.user.findFirstOrThrow({
      where: { email: w.emails.lawyer },
    });
    const challan = await ctx.prisma.challan.findFirstOrThrow({ where: { caseId } });
    const payment = await ctx.prisma.payment.findFirstOrThrow({
      where: { challanId: challan.id, status: 'SUCCESS' },
    });
    secrets.push(
      'Zainab Petitioner',
      '36302-7777777-1',
      '+92 301 7777777',
      'Bosan Road',
      'Kamran Respondent',
      '36302-8888888-2',
      'secret-plaint',
      'Secret Street',
      'Card Holder Secret',
      judge.firstName + ' ' + judge.lastName,
      lawyerUser.firstName + ' ' + lawyerUser.lastName,
      lawyerUser.email,
      challan.challanNo,
      payment.receiptNo!,
      challan.amount.toFixed(2),
      '750000',
      caseId,
    );
  });
  afterAll(() => ctx.app.close());

  const expectNoSecrets = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const s of secrets) expect(text).not.toContain(s);
  };

  it('answers without a login and returns only the whitelisted fields', async () => {
    const res = await lookup(ucn).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(ALLOWED_TOP);
    expect(res.body).toMatchObject({ ucn, caseType: 'CIVIL_SUIT', stage: 'HEARING' });
    expect(res.body.progress.stages.map((s: { key: string }) => s.key)).toEqual([
      'FILED',
      'FEE_PAID',
      'ALLOCATED',
      'HEARING',
      'DECIDED',
    ]);
    expect(res.body.progress.stages.map((s: { state: string }) => s.state)).toEqual([
      'completed',
      'completed',
      'completed',
      'current',
      'upcoming',
    ]);
    expect(Object.keys(res.body.nextHearing).sort()).toEqual(ALLOWED_HEARING);
    expectNoSecrets(res.body);
  });

  it('shows the hearing date but hides its time and courtroom until the cause list is published', async () => {
    const before = await lookup(ucn).expect(200);
    expect(before.body.nextHearing).toMatchObject({
      date: day,
      published: false,
      startTime: null,
      courtroom: null,
      timeSlot: null,
    });
    await admin
      .post('/api/admin/cause-lists/publish')
      .send({ courtId: w.courtId, date: day })
      .expect(200);
    const after = await lookup(ucn).expect(200);
    expect(after.body.nextHearing).toMatchObject({
      date: day,
      published: true,
      startTime: '09:30',
      endTime: '10:00',
      timeSlot: 2,
      courtroom: 'Room 1',
    });
    expect(after.body.progress.detail.kind).toBe('NEXT_HEARING');
    expectNoSecrets(after.body);
  });

  it('accepts a lower-case UCN and returns the same case', async () => {
    const res = await lookup(ucn.toLowerCase()).expect(200);
    expect(res.body.ucn).toBe(ucn);
  });

  it('rejects malformed UCNs with a validation error and no case data', async () => {
    for (const bad of [
      '',
      'DA-2026-XYZ-000001',
      'DA-26-CIV-1',
      "DA-2026-CIV-000001' OR 1=1",
      '../../etc',
    ]) {
      const res = await lookup(bad).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body).not.toHaveProperty('ucn');
    }
  });

  it('returns the generic 404 for an unknown UCN and for a draft', async () => {
    const res = await lookup('DA-2026-CIV-999999').expect(404);
    expect(res.body.message).toBe(NOT_FOUND);
    await ctx.prisma.case.update({ where: { id: caseId }, data: { status: 'DRAFT' } });
    const draft = await lookup(ucn).expect(404);
    expect(draft.body.message).toBe(NOT_FOUND);
    await ctx.prisma.case.update({ where: { id: caseId }, data: { status: 'HEARING_FIXED' } });
  });

  it('records repeated failed lookups from one host as a security event (not an escalation alert)', async () => {
    await ctx.prisma.securityEvent.deleteMany({});
    for (let i = 0; i < 5; i++) await lookup(`DA-2026-WRT-00010${i}`).expect(404);
    const events = await ctx.prisma.securityEvent.findMany({
      where: { type: 'CASE_STATUS_PROBE' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe('UCN_LOOKUP_REPEATED_FAILURES');
    expect(await ctx.prisma.securityAlert.count()).toBe(0);
    const audit = await ctx.prisma.auditLog.count({
      where: { action: 'SECURITY_PUBLIC_STATUS_PROBE' },
    });
    expect(audit).toBe(1);
  });

  it('shows a decided case as decided without the order text or the judge', async () => {
    await ctx.prisma.case.update({
      where: { id: caseId },
      data: {
        status: 'DECIDED',
        decidedAt: new Date(),
        decisionType: 'JUDGMENT',
        decisionText: 'Secret order text for the parties only.',
      },
    });
    const res = await lookup(ucn).expect(200);
    expect(res.body.stage).toBe('DECIDED');
    expect(res.body.nextHearing).toBeNull();
    expect(res.body.progress.stages.every((s: { state: string }) => s.state === 'completed')).toBe(
      true,
    );
    expect(JSON.stringify(res.body)).not.toContain('Secret order text');
    expectNoSecrets(res.body);
  });

  describe('rate limiting', () => {
    let limited: TestContext;
    beforeAll(async () => {
      process.env.ENABLE_THROTTLE_IN_TEST = 'true';
      limited = await createTestApp();
    });
    afterAll(async () => {
      await limited.app.close();
      delete process.env.ENABLE_THROTTLE_IN_TEST;
    });

    it('allows 10 lookups per minute and answers the 11th with 429', async () => {
      const server = limited.app.getHttpServer();
      for (let i = 0; i < 10; i++) {
        await request(server).get(`/api/public/cases/status?ucn=${ucn}`).expect(200);
      }
      const res = await request(server).get(`/api/public/cases/status?ucn=${ucn}`).expect(429);
      expect(res.body.message).toBe(Messages.TOO_MANY_REQUESTS);
    });
  });
});
