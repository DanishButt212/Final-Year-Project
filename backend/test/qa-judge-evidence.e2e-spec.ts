/** QA: judge scope, outcomes, decisions (immutable, cancel summons), orders list, evidence encryption and locks. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pkToday } from '../src/common/pk-time';
import { allocateDirect, Api, buildWorld, fileCase, login, World } from './fixtures';
import { createTestApp, pdfBuffer, resetDatabase, TestContext } from './helpers';
import { TEST_UPLOAD_DIR } from './setup-env';

describe('QA judge and evidence vault (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let judge: Api;
  let judge2: Api;
  let litigant: Api;
  let litigant2: Api;
  let lawyer: Api;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
    judge = await login(ctx, w.emails.judge);
    judge2 = await login(ctx, w.emails.judge2);
    litigant = await login(ctx, w.emails.litigant);
    litigant2 = await login(ctx, w.emails.litigant2);
    lawyer = await login(ctx, w.emails.lawyer);
  });
  afterAll(() => ctx.app.close());

  let seq = 0;
  /** An allocated case with a hearing dated today (written directly, bypassing the "no past slot" rule). */
  const caseWithHearing = async (filer: Api = litigant, title = 'QA vs. State') => {
    const { case: c } = await fileCase(filer, { title });
    await allocateDirect(ctx.prisma, c.id, w);
    // A distinct slot each time (today, then earlier days): the partial unique indexes forbid double booking.
    const n = seq++;
    const h = await ctx.prisma.hearing.create({
      data: {
        caseId: c.id,
        judgeId: w.ids.judge,
        courtroomId: w.rooms.r1,
        date: new Date(pkToday().getTime() - Math.floor(n / 10) * 86_400_000),
        timeSlot: (n % 10) + 1,
      },
    });
    await ctx.prisma.case.update({ where: { id: c.id }, data: { status: 'HEARING_FIXED' } });
    return { caseId: c.id, ucn: c.ucn, hearingId: h.id };
  };

  describe('judge scope and decisions', () => {
    it('lists only cases allocated to the judge and hides others (404)', async () => {
      const { caseId } = await caseWithHearing();
      const mine = await judge.get('/api/judge/cases').expect(200);
      expect(mine.body.data.map((c: { id: string }) => c.id)).toContain(caseId);
      const other = await judge2.get('/api/judge/cases').expect(200);
      expect(other.body.data.map((c: { id: string }) => c.id)).not.toContain(caseId);
      await judge2.get(`/api/judge/cases/${caseId}`).expect(404);
      await judge.get(`/api/judge/cases/${caseId}`).expect(200);
    });

    it('records an adjourned outcome once, with validated notes', async () => {
      const { hearingId } = await caseWithHearing();
      await judge.post(`/api/judge/hearings/${hearingId}/outcome`).send({ status: 'ADJOURNED', orderNotes: 'short' }).expect(400);
      await judge2.post(`/api/judge/hearings/${hearingId}/outcome`).send({ status: 'ADJOURNED', orderNotes: 'Adjourned for evidence.' }).expect(404);
      await judge.post(`/api/judge/hearings/${hearingId}/outcome`).send({ status: 'ADJOURNED', orderNotes: 'Adjourned for evidence.' }).expect(201);
      const again = await judge.post(`/api/judge/hearings/${hearingId}/outcome`).send({ status: 'COMPLETED', orderNotes: 'Second attempt here.' });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('An outcome has already been recorded for this hearing.');
    });

    it('refuses an outcome for a future hearing', async () => {
      const { caseId } = await caseWithHearing();
      const future = await ctx.prisma.hearing.create({
        data: { caseId, judgeId: w.ids.judge, courtroomId: w.rooms.r1, date: new Date(pkToday().getTime() + 3 * 86_400_000), timeSlot: 2 },
      });
      const res = await judge.post(`/api/judge/hearings/${future.id}/outcome`).send({ status: 'COMPLETED', orderNotes: 'Parties heard in full.' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('An outcome can be recorded only for a hearing dated today or earlier.');
    });

    it('decides a case once; the case is then immutable and its open summons are cancelled', async () => {
      const { caseId } = await caseWithHearing();
      const issued = await admin
        .post('/api/admin/summons')
        .send({ caseId, noticeType: 'SUMMONS', recipientName: 'Respondent Person', serviceAddress: 'House 12, Street 4, Cantt Multan', sector: 'Cantt', priority: 'NORMAL' })
        .expect(201);
      const summonsId = issued.body.summons?.id ?? issued.body.id;
      await judge.post(`/api/judge/cases/${caseId}/decide`).send({ decisionType: 'JUDGMENT', orderText: 'too short' }).expect(400);
      await judge
        .post(`/api/judge/cases/${caseId}/decide`)
        .send({ decisionType: 'JUDGMENT', orderText: 'Suit decreed in favour of the plaintiff with costs.' })
        .expect(201);
      const twice = await judge
        .post(`/api/judge/cases/${caseId}/decide`)
        .send({ decisionType: 'DISMISSED', orderText: 'Trying to decide the same case again.' });
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('This case has already been decided.');
      const s = await ctx.prisma.summons.findUniqueOrThrow({ where: { id: summonsId } });
      expect(s.status).toBe('CANCELLED');
      const c = await ctx.prisma.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c).toMatchObject({ status: 'DECIDED', decisionType: 'JUDGMENT' });
      // No re-allocation, no new hearings, no new exhibits.
      expect((await admin.post(`/api/admin/cases/${caseId}/allocate`).send({ mode: 'MANUAL', courtId: w.courtId, judgeId: w.ids.judge2, reallocate: true })).status).toBe(409);
      const ev = await litigant.post(`/api/cases/${caseId}/evidence`).field('category', 'SCANNED_DOCUMENT').field('description', 'Late exhibit').attach('files', pdfBuffer('late'), 'late.pdf');
      expect(ev.status).toBe(409);
    });

    it('shows orders and decisions only to the recording judge, with search and outcome filter', async () => {
      const mine = await judge.get('/api/judge/orders').expect(200);
      const outcomes = mine.body.data.map((o: { outcome: string }) => o.outcome);
      expect(outcomes).toEqual(expect.arrayContaining(['ADJOURNED', 'JUDGMENT']));
      const judgments = await judge.get('/api/judge/orders?outcome=JUDGMENT').expect(200);
      expect(judgments.body.data.every((o: { outcome: string }) => o.outcome === 'JUDGMENT')).toBe(true);
      const none = await judge.get('/api/judge/orders?search=zzzz-nothing').expect(200);
      expect(none.body.data).toHaveLength(0);
      expect((await judge2.get('/api/judge/orders').expect(200)).body.meta.total).toBe(0);
      await judge.get('/api/judge/orders?outcome=BOGUS').expect(400);
    });
  });

  describe('evidence vault', () => {
    let caseId: string;
    let evidenceId: string;
    const content = pdfBuffer('confidential-exhibit-content');

    beforeAll(async () => {
      ({ caseId } = await caseWithHearing(lawyer, 'Vault vs. State'));
    });

    it('stores uploads encrypted and decrypts them on download', async () => {
      const res = await lawyer
        .post(`/api/cases/${caseId}/evidence`)
        .field('category', 'SCANNED_DOCUMENT')
        .field('description', 'Signed agreement scan')
        .attach('files', content, 'agreement.pdf')
        .expect(201);
      expect(res.body.message).toBe('Digital Exhibit Log Added Successfully.');
      const e = await ctx.prisma.evidence.findFirstOrThrow({ where: { caseId } });
      evidenceId = e.id;
      const raw = readFileSync(join(TEST_UPLOAD_DIR, e.filePath));
      expect(raw.equals(content)).toBe(false);
      expect(raw.includes(Buffer.from('confidential-exhibit-content'))).toBe(false);
      expect(raw.subarray(0, 5).toString()).not.toBe('%PDF-');
      const dl = await lawyer.get(`/api/cases/${caseId}/evidence/${e.id}/download`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(dl.status).toBe(200);
      expect((dl.body as Buffer).equals(content)).toBe(true);
    });

    it('hides the vault from non-parties and refuses a renamed executable', async () => {
      await litigant2.get(`/api/cases/${caseId}/vault`).expect(404);
      await litigant2.get(`/api/cases/${caseId}/evidence/${evidenceId}/download`).expect(404);
      const bad = await lawyer
        .post(`/api/cases/${caseId}/evidence`)
        .field('category', 'SCANNED_DOCUMENT')
        .field('description', 'Disguised file')
        .attach('files', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'scan.pdf');
      expect(bad.status).toBe(400);
    });

    it('lets only the uploader edit or delete, and nobody once locked by the judge', async () => {
      await litigant2.patch(`/api/cases/${caseId}/evidence/${evidenceId}`).send({ description: 'Hijacked exhibit description' }).expect(404);
      await lawyer.patch(`/api/cases/${caseId}/evidence/${evidenceId}`).send({ description: 'Signed agreement (page 1)' }).expect(200);
      await judge2.post(`/api/judge/cases/${caseId}/evidence/lock`).send({ reason: 'Not my case' }).expect(404);
      await judge.post(`/api/judge/cases/${caseId}/evidence/lock`).send({ reason: 'Exhibit admitted' }).expect(200);
      const edit = await lawyer.patch(`/api/cases/${caseId}/evidence/${evidenceId}`).send({ description: 'Changed after lock' });
      expect(edit.status).toBe(403);
      expect(edit.body.message).toBe('Action Denied: Document is locked by order of the bench.');
      expect((await lawyer.delete(`/api/cases/${caseId}/evidence/${evidenceId}`)).status).toBe(403);
    });
  });
});
