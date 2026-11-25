import { pkToday } from '../src/common/pk-time';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { StorageService } from '../src/storage/storage.service';
import type { Page } from '../../frontend/node_modules/playwright';
import { openTestPortals } from './browser-fixture';
import {
  allocateDirect,
  Api,
  buildWorld,
  fileCase,
  login,
  PASSWORD,
  workingDay,
  World,
} from './fixtures';
import { createTestApp, createUser, pdfBuffer, resetDatabase, TestContext } from './helpers';

describe('hearing clash, day-only coverage and absence workflow', () => {
  const base = '/api/hearing-coverage';
  let document: Buffer;
  let ctx: TestContext;
  let w: World;
  let reader: Api;
  let otherReader: Api;
  let judge: Api;
  let original: Api;
  let representedLitigant: Api;
  let chamberOwner: Api;
  let replacement: Api;
  let otherJudge: Api;
  let replacementId: string;
  let chamberId: string;
  let caseId: string;
  let docId: string;

  beforeAll(async () => {
    document = await new Promise<Buffer>((resolve, reject) => {
      const pdf = new PDFDocument();
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.once('end', () => resolve(Buffer.concat(chunks)));
      pdf.once('error', reject);
      pdf.text('Coverage test pleading').end();
    });
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    const user = await createUser(ctx.prisma, {
      role: 'LAWYER',
      email: 'cover@qa.test',
      cnic: '36302-1888855-5',
      password: PASSWORD,
    });
    const readerUser = await createUser(ctx.prisma, {
      role: 'ADMIN', email: 'another-reader@qa.test', cnic: '36302-1888856-6', password: PASSWORD,
    });
    otherReader = await login(ctx, readerUser.email);
    replacementId = (
      await ctx.prisma.lawyerProfile.create({
        data: { userId: user.id, barNumber: 'LH-9044', verificationStatus: 'VERIFIED' },
      })
    ).id;
    [reader, judge, otherJudge, original, chamberOwner, replacement, representedLitigant] =
      await Promise.all([
        login(ctx, w.emails.admin),
        login(ctx, w.emails.judge),
        login(ctx, w.emails.judge2),
        login(ctx, w.emails.lawyer),
        login(ctx, w.emails.lawyer2),
        login(ctx, user.email),
        login(ctx, w.emails.litigant),
      ]);
    const client = await ctx.prisma.user.findUniqueOrThrow({ where: { id: w.ids.litigant } });
    const filed = await fileCase(
      original,
      { petitioners: [{ name: `${client.firstName} ${client.lastName}`, cnic: client.cnic }] },
      [{ name: 'pleading.pdf', content: document }],
    );
    caseId = filed.case.id;
    await allocateDirect(ctx.prisma, caseId, w);
    docId = (await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId } })).id;
    chamberId = (
      await ctx.prisma.chamberProfile.findUniqueOrThrow({ where: { lawyerId: w.lawyer2ProfileId } })
    ).id;
    await chamberOwner.post(`${base}/chamber/members`).send({ barNumber: 'LH-1001' }).expect(204);
  });
  afterAll(async () => ctx?.app.close());

  const hearing = async (timeSlot: number, date = pkToday()) =>
    ctx.prisma.hearing.create({
      data: {
        caseId,
        readerId: w.ids.admin,
        date,
        timeSlot,
        startTime: '09:00',
        judgeId: w.ids.judge,
        courtroomId: w.rooms.r1,
      },
    });
  const report = async (id: string, shared?: string) =>
    (
      await original
        .post(base)
        .send({ hearingId: id, reason: 'Conflicting court appearance.', chamberId: shared })
        .expect(201)
    ).body;
  const act = (by: Api, id: string, action: string, fields: Record<string, string> = {}) =>
    by.post(`${base}/requests/${id}/actions`).send({ action, ...fields });
  const pdf = () => `/api/cases/${caseId}/pleadings/${docId}/download`;
  const contains = async (by: Api, id: string) =>
    (await by.get(base).expect(200)).body.requests.some((r: { id: string }) => r.id === id);

  it('keeps private reports out of chamber and Reader queues until acceptance and grants only day-of read access', async () => {
    const h = await hearing(1);
    const r = await report(h.id);
    expect((await chamberOwner.get(`${base}/chamber`).expect(200)).body.requests).toEqual([]);
    await act(original, r.id, 'NOMINATE', { candidateId: w.lawyer2ProfileId }).expect(204);
    expect(await contains(reader, r.id)).toBe(false);
    await act(chamberOwner, r.id, 'DECLINE', { note: 'Already committed outside court.' }).expect(
      204,
    );
    expect((await original.get(base).expect(200)).body.requests[0]).toMatchObject({
      status: 'NEEDS_NOMINEE',
      decisionNote: 'Already committed outside court.',
    });
    await act(original, r.id, 'NOMINATE', { candidateId: replacementId }).expect(204);
    await act(replacement, r.id, 'ACCEPT').expect(204);
    expect(await contains(reader, r.id)).toBe(true);
    const exhibitResponse = await original
      .post(`/api/cases/${caseId}/evidence`)
      .field('category', 'SCANNED_DOCUMENT')
      .field('description', 'Coverage exhibit')
      .attach('files', pdfBuffer('coverage exhibit'), 'exhibit.pdf')
      .expect(201);
    const exhibit = await ctx.prisma.evidence.findFirstOrThrow({ where: { caseId } });
    expect(exhibitResponse.body).toBeDefined();
    const challan = (await original.post(`/api/cases/${caseId}/challan`).expect(200)).body.challan;
    const checkout = (
      await original.post('/api/payments/checkout').send({ challanId: challan.id }).expect(200)
    ).body;
    await original
      .post('/api/mock-gateway/authorize')
      .send({
        paymentId: checkout.paymentId,
        cardholderName: 'Test Lawyer',
        cardNumber: '4242424242424242',
        expiry: '12/30',
        cvv: '123',
      })
      .expect(200);
    const summons = await ctx.prisma.summons.create({
      data: {
        caseId,
        recipientName: 'Test recipient',
        serviceAddress: 'Test address',
        sector: 'Test sector',
        status: 'EXECUTED',
        executedAt: new Date(),
        serviceMode: 'PERSONAL_DELIVERY',
        seal: 'fixture-seal',
      },
    });
    const storageKey = `coverage-fixtures/${h.id}.pdf`;
    await ctx.app.get(StorageService).saveFromStream(Readable.from(document), storageKey);
    await ctx.prisma.hearingTranscript.create({
      data: {
        hearingId: h.id,
        text: 'Signed transcript fixture.',
        status: 'SIGNED',
        signedPdfKey: storageKey,
        signedPdfSha256: createHash('sha256').update(document).digest('hex'),
      },
    });
    const protectedDocuments = [
      pdf(),
      `/api/cases/${caseId}/documents/${docId}/download`,
      `/api/cases/${caseId}/evidence/${exhibit.id}/download`,
      `/api/challans/${challan.id}/pdf`,
      `/api/payments/${checkout.paymentId}/receipt`,
      `/api/summons/${summons.id}/proof.pdf`,
      `/api/hearing-transcripts/${h.id}/pdf`,
    ];
    for (const path of protectedDocuments) await replacement.get(path).expect(404);
    await act(reader, r.id, 'READER_APPROVE').expect(204);
    await replacement.get(pdf()).expect(404);
    await act(otherJudge, r.id, 'JUDGE_APPROVE').expect(404);
    await act(judge, r.id, 'JUDGE_APPROVE').expect(204);
    for (const path of protectedDocuments) {
      await original.get(path).expect(200);
      await replacement
        .get(path)
        .expect('Content-Type', /application\/pdf/)
        .expect(200);
      await chamberOwner.get(path).expect(404);
    }
    await replacement
      .post(`/api/cases/${caseId}/documents`)
      .attach('files', document, 'unauthorized.pdf')
      .expect(404);
    expect((await replacement.get(`/api/cases/${caseId}`).expect(200)).body.coverageReadOnly).toBe(
      true,
    );
    expect(
      (await replacement.get(`/api/hearings/mine?when=upcoming`).expect(200)).body.data,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: h.id })]));
    await original.get(pdf()).expect(200);
    expect(
      await ctx.prisma.caseParty.count({ where: { caseId, lawyerId: w.lawyerProfileId } }),
    ).toBeGreaterThan(0);
    await chamberOwner.get(pdf()).expect(404);
    expect(await ctx.prisma.caseParty.count({ where: { caseId, lawyerId: replacementId } })).toBe(
      0,
    );

    await judge
      .post(`${base}/absences`)
      .send({
        hearingId: h.id,
        lawyerId: w.lawyerProfileId,
        reason: 'Absent at call.',
      })
      .expect(204);
    await judge
      .post(`${base}/absences`)
      .send({ hearingId: h.id, lawyerId: replacementId, reason: 'Excused.' })
      .expect(204);
    const pending = (await judge.get(`${base}/absences?hearingId=${h.id}`).expect(200)).body;
    expect(pending).toHaveLength(2);
    for (const item of pending) expect(item).toMatchObject({
      status: 'PENDING_DECISION', fineRequired: null, amount: null, hearing: { id: h.id },
    });
    const first = await ctx.prisma.hearingAbsence.findFirstOrThrow({
      where: { hearingId: h.id, lawyerId: w.lawyerProfileId },
    });
    const second = await ctx.prisma.hearingAbsence.findFirstOrThrow({
      where: { hearingId: h.id, lawyerId: replacementId },
    });
    const decideFine = (actor: Api, id: string, fineRequired: boolean) =>
      actor.post(`${base}/absences/${id}/decision`).send({ fineRequired });
    expect((await reader.get(`${base}/absences`).expect(200)).body).toEqual([]);
    await reader.post(`${base}/absences/${first.id}/fine`).send({ amount: '1' }).expect(409);
    await decideFine(reader, first.id, true).expect(403);
    await decideFine(otherJudge, first.id, true).expect(404);
    await decideFine(judge, second.id, false).expect(204);
    expect((await reader.get(`${base}/absences`).expect(200)).body).toEqual([]);
    const fineDecisions = await Promise.all([
      decideFine(judge, first.id, true),
      decideFine(judge, first.id, true),
    ]);
    expect(fineDecisions.map((result) => result.status).sort()).toEqual([204, 409]);
    const fineQueue = (await reader.get(`${base}/absences`).expect(200)).body;
    expect(fineQueue).toHaveLength(1);
    expect(fineQueue[0]).toMatchObject({
      id: first.id, status: 'AWAITING_FINE_AMOUNT', hearingDate: h.date.toISOString().slice(0, 10),
      hearing: { id: h.id, ucn: expect.any(String) }, lawyer: expect.any(String),
    });
    expect((await otherReader.get(`${base}/absences`).expect(200)).body).toEqual([]);
    await otherReader.post(`${base}/absences/${first.id}/fine`).send({ amount: '1' }).expect(409);
    await judge.post(`${base}/absences/${first.id}/fine`).send({ amount: '1' }).expect(403);
    expect(await ctx.prisma.notification.count({
      where: { userId: w.ids.admin, type: 'LAWYER_FINE_AMOUNT_REQUIRED' },
    })).toBe(1);
    const enterFine = (amount: string) =>
      reader.post(`${base}/absences/${first.id}/fine`).send({ amount });
    for (const invalid of ['0', '-50', '1250.501']) await enterFine(invalid).expect(400);
    const fineWrites = await Promise.all([enterFine('1250.50'), enterFine('1250.50')]);
    expect(fineWrites.map((result) => result.status).sort()).toEqual([204, 409]);
    await enterFine('1500').expect(409);
    const absences = (await judge.get(`${base}/absences?hearingId=${h.id}`).expect(200)).body;
    expect(absences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: 'FINE_RECORDED', amount: '1250.50' }),
        expect.objectContaining({ id: second.id, status: 'NO_FINE', amount: null }),
      ]),
    );
    expect(await ctx.prisma.hearingAbsence.findUnique({ where: { id: first.id } })).toMatchObject({
      hearingId: h.id, lawyerId: w.lawyerProfileId, readerId: w.ids.admin,
    });
    for (const action of ['LAWYER_FINE_DECIDED', 'LAWYER_FINE_RECORDED']) {
      expect(await ctx.prisma.auditLog.count({ where: { action, entityId: first.id } })).toBe(1);
    }
    await reader
      .post(
        `${base}/absences/${absences.find((a: { fineRequired: boolean }) => !a.fineRequired).id}/fine`,
      )
      .send({ amount: '1' })
      .expect(409);

    // Move the approved fixture one day back to simulate an expired grant with an otherwise matching hearing.
    const past = new Date(pkToday().getTime() - 86_400_000);
    await ctx.prisma.$transaction([
      ctx.prisma.hearingCoverage.update({ where: { id: r.id }, data: { hearingDate: past } }),
      ctx.prisma.hearing.update({ where: { id: h.id }, data: { date: past } }),
    ]);
    for (const path of protectedDocuments) await replacement.get(path).expect(404);
    await replacement.get(`/api/cases/${caseId}/vault`).expect(404);
  });

  it('shares minimal information, allocates within the chamber, and holds access until the hearing day', async () => {
    const h = await hearing(2, new Date(workingDay(2)));
    const r = await report(h.id, chamberId);
    const row = (await chamberOwner.get(`${base}/chamber`).expect(200)).body.requests[0];
    expect(row).toMatchObject({ id: r.id, status: 'CHAMBER_PENDING' });
    expect(row.reason).toBeUndefined();
    expect(row.hearing.caseId).toBeUndefined();
    expect(row.hearing.title).toBeUndefined();
    expect((await replacement.get(`${base}/chamber`).expect(200)).body.requests).toEqual([]);
    await act(chamberOwner, r.id, 'ALLOCATE', { candidateId: replacementId }).expect(404);
    await act(chamberOwner, r.id, 'ALLOCATE', { candidateId: w.lawyer2ProfileId }).expect(204);
    expect(await contains(reader, r.id)).toBe(true);
    await act(reader, r.id, 'READER_APPROVE').expect(204);
    await act(judge, r.id, 'JUDGE_APPROVE').expect(204);
    await chamberOwner.get(pdf()).expect(404);

    const date = workingDay(2);
    const otherCase = (await fileCase(chamberOwner)).case;
    await allocateDirect(ctx.prisma, otherCase.id, w, w.ids.judge2, w.rooms.r2);
    const vacancies = await reader
      .get(`/api/admin/scheduling/available-slots?caseId=${otherCase.id}&from=${date}&days=1`)
      .expect(200);
    expect(vacancies.body.days[0].slots.map((slot: { slot: number }) => slot.slot)).not.toContain(
      2,
    );
    const book = (slot: number) =>
      reader.post('/api/admin/hearings').send({
        caseId: otherCase.id,
        courtroomId: w.rooms.r2,
        date,
        slot,
      });
    await book(2).expect(409);
    await book(3).expect(201);
    const imported = await ctx.prisma.hearing.create({
      data: {
        caseId: otherCase.id,
        date: h.date,
        timeSlot: 2,
        startTime: '09:30',
        judgeId: w.ids.judge2,
        courtroomId: w.rooms.r2,
      },
    });
    const scan = await reader
      .post('/api/admin/scheduling/run-check')
      .send({ date, courtId: w.courtId })
      .expect(200);
    expect(scan.body).toMatchObject({
      valid: false,
      conflicts: expect.arrayContaining([
        expect.objectContaining({
          id: h.id,
          conflicts: expect.arrayContaining([
            expect.objectContaining({ type: 'LAWYER', hearingId: imported.id }),
          ]),
        }),
      ]),
    });
  });

  it('shows Reader and judge rejections and rechecks the nominee calendar at final approval', async () => {
    for (const slot of [3, 4]) {
      const h = await hearing(slot);
      const r = await report(h.id);
      await act(original, r.id, 'NOMINATE', { candidateId: replacementId }).expect(204);
      await act(replacement, r.id, 'ACCEPT').expect(204);
      if (slot === 3) {
        await act(reader, r.id, 'READER_REJECT', { note: 'Clarification needed.' }).expect(204);
      } else {
        await act(reader, r.id, 'READER_APPROVE').expect(204);
        const clashCase = (await fileCase(replacement)).case;
        await allocateDirect(ctx.prisma, clashCase.id, w, w.ids.judge2, w.rooms.r2);
        await ctx.prisma.hearing.create({
          data: {
            caseId: clashCase.id,
            date: h.date,
            timeSlot: h.timeSlot,
            judgeId: w.ids.judge2,
            courtroomId: w.rooms.r2,
          },
        });
        await act(judge, r.id, 'JUDGE_APPROVE').expect(409);
        await act(judge, r.id, 'JUDGE_REJECT', { note: 'Nominee is unavailable.' }).expect(204);
      }
      const item = (await original.get(base).expect(200)).body.requests.find(
        (row: { id: string }) => row.id === r.id,
      );
      expect(item).toMatchObject({
        status: 'REJECTED',
        decisionNote: slot === 3 ? 'Clarification needed.' : 'Nominee is unavailable.',
      });
      await replacement.get(pdf()).expect(404);
    }
  });

  it('blocks last-summons substitutions at filing and during review, and uses the real scheduling board endpoint', async () => {
    const date = new Date(workingDay(3));
    const first = await hearing(5, date);
    await reader
      .patch(`${base}/hearings/${first.id}/last-summons`)
      .send({ lastSummons: true })
      .expect(204);
    const flagged = await report(first.id, chamberId);
    expect(flagged).toMatchObject({ status: 'RESCHEDULE_REQUIRED', chamberId: null });
    await act(original, flagged.id, 'NOMINATE', { candidateId: replacementId }).expect(409);
    await reader
      .patch(`/api/admin/hearings/${first.id}/reschedule`)
      .send({ date: workingDay(4), slot: 2 })
      .expect(200);
    const later = await hearing(6, date);
    const r = await report(later.id);
    await act(original, r.id, 'NOMINATE', { candidateId: replacementId }).expect(204);
    await act(replacement, r.id, 'ACCEPT').expect(204);
    await act(reader, r.id, 'READER_APPROVE').expect(204);
    await reader
      .patch(`${base}/hearings/${later.id}/last-summons`)
      .send({ lastSummons: true })
      .expect(204);
    await act(judge, r.id, 'JUDGE_APPROVE').expect(409);
    await reader
      .patch(`/api/admin/hearings/${later.id}/reschedule`)
      .send({ date: workingDay(3), slot: 7 })
      .expect(400);
    await reader
      .patch(`/api/admin/hearings/${later.id}/reschedule`)
      .send({ date: workingDay(4), slot: 1 })
      .expect(200);
    const rescheduled = (await original.get(base).expect(200)).body.requests.find(
      (row: { id: string }) => row.id === r.id,
    );
    expect(rescheduled).toMatchObject({ status: 'RESCHEDULED', hearing: { date: workingDay(4) } });
    for (const id of [first.id, later.id]) {
      expect(
        (await representedLitigant.get('/api/hearings/mine?when=upcoming').expect(200)).body.data,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id, date: workingDay(4) })]));
      expect(
        (await original.get('/api/hearings/mine?when=upcoming').expect(200)).body.data,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id, date: workingDay(4) })]));
      expect(
        (
          await judge
            .get(`/api/judge/hearings?from=${workingDay(4)}&to=${workingDay(4)}`)
            .expect(200)
        ).body.data,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id, date: workingDay(4) })]));
    }
  });

  it('lets an independent lawyer nominate an available registered lawyer', async () => {
    const independent = (await fileCase(replacement)).case;
    await allocateDirect(ctx.prisma, independent.id, w, w.ids.judge2, w.rooms.r2);
    const h = await ctx.prisma.hearing.create({
      data: {
        caseId: independent.id,
        date: new Date(workingDay(5)),
        timeSlot: 2,
        judgeId: w.ids.judge2,
        courtroomId: w.rooms.r2,
      },
    });
    expect((await replacement.get(`${base}/hearings/${h.id}`).expect(200)).body.chambers).toEqual(
      [],
    );
    const r = (
      await replacement.post(base).send({ hearingId: h.id, reason: 'Unavailable.' }).expect(201)
    ).body;
    await act(replacement, r.id, 'NOMINATE', { candidateId: w.lawyerProfileId }).expect(204);
    expect(await contains(reader, r.id)).toBe(false);
    await act(original, r.id, 'DECLINE', { note: 'Unavailable.' }).expect(204);
    expect(await contains(reader, r.id)).toBe(false);
    await act(replacement, r.id, 'NOMINATE', { candidateId: w.lawyer2ProfileId }).expect(204);
    await act(chamberOwner, r.id, 'ACCEPT').expect(204);
    expect(await contains(reader, r.id)).toBe(true);
  });

  it('persists exactly one clash request and each approval when the same action is submitted twice', async () => {
    const h = await hearing(10, new Date(workingDay(6)));
    const submit = () =>
      original.post(base).send({ hearingId: h.id, reason: 'An appeal in another court overlaps.' });
    const reports = await Promise.all([submit(), submit()]);
    expect(reports.map((result) => result.status).sort()).toEqual([201, 409]);
    const request = reports.find((result) => result.status === 201)!.body;

    await act(original, request.id, 'NOMINATE', { candidateId: replacementId }).expect(204);
    await act(replacement, request.id, 'ACCEPT').expect(204);
    await act(judge, request.id, 'JUDGE_APPROVE').expect(409);
    for (const [by, action] of [[reader, 'READER_APPROVE'], [judge, 'JUDGE_APPROVE']] as const) {
      const approvals = await Promise.all([act(by, request.id, action), act(by, request.id, action)]);
      expect(approvals.map((result) => result.status).sort()).toEqual([204, 409]);
    }

    const refreshed = await login(ctx, w.emails.lawyer);
    expect((await refreshed.get(base).expect(200)).body.requests).toContainEqual(
      expect.objectContaining({ id: request.id, status: 'APPROVED', readerAt: expect.any(String), judgeAt: expect.any(String) }),
    );
    expect(await ctx.prisma.hearingCoverage.count({ where: { hearingId: h.id } })).toBe(1);
    for (const action of ['HEARING_CLASH_REPORTED', 'HEARING_COVERAGE_READER_APPROVE', 'HEARING_COVERAGE_JUDGE_APPROVE']) {
      expect(await ctx.prisma.auditLog.count({ where: { action, entityId: request.id } })).toBe(1);
    }
    await replacement.get(pdf()).expect(404);
  });

  const browserTest = process.env.COVERAGE_BROWSER_URL ? it : it.skip;
  browserTest(
    'runs real Lawyer, Chamber, Reader and Judge handoffs in the browser',
    async () => {
      const web = process.env.COVERAGE_BROWSER_URL!;
      const { browser, signIn } = await openTestPortals(ctx, web);
      const testApi = await ctx.app.getUrl();
      const card = (page: Page, id: string) => page.getByTestId(`coverage-request-${id}`);
      const dashboard = (page: Page, path: string) => page.goto(`${web}${path}`);
      async function submitClash(page: Page, hearingId: string, sharing?: string) {
        await dashboard(page, `/lawyer/hearing-clashes?hearing=${hearingId}`);
        await page.getByLabel('Reason for the clash').fill('Another court appearance overlaps.');
        const share = page.getByLabel(/Do you want to share this case/);
        if (sharing) await share.selectOption(sharing);
        else expect(await share.count()).toBe(0);
        const response = page.waitForResponse(
          (res) => res.url().endsWith(base) && res.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Report clash', exact: true }).click();
        const saved = await response;
        expect(saved.status()).toBe(201);
        const record = await saved.json();
        expect(record.hearing.id).toBe(hearingId);
        return record.id as string;
      }
      async function decide(page: Page, id: string, action: string, reason?: string) {
        const request = card(page, id);
        await request.getByLabel('Decision', { exact: false }).first().selectOption(action);
        if (reason) await request.getByLabel('Decision reason').fill(reason);
        const response = page.waitForResponse((res) =>
          res.url().endsWith(`/requests/${id}/actions`),
        );
        await request.getByRole('button', { name: 'Save decision' }).click();
        expect((await response).status()).toBe(204);
      }
      async function nominate(page: Page, id: string, candidateId: string) {
        const request = card(page, id);
        await request.getByLabel('Available lawyer').selectOption(candidateId);
        const response = page.waitForResponse((res) =>
          res.url().endsWith(`/requests/${id}/actions`),
        );
        await request.getByRole('button', { name: 'Nominate substitute' }).click();
        expect((await response).status()).toBe(204);
      }
      try {
        const lawyerPage = await signIn(w.emails.lawyer);
        const chamberPage = await signIn(w.emails.lawyer2);
        const readerPage = await signIn(w.emails.admin);
        const judgePage = await signIn(w.emails.judge);
        const nomineePage = await signIn('cover@qa.test');
        const sharedHearing = await hearing(8, new Date(workingDay(7)));
        const sharedId = await submitClash(lawyerPage, sharedHearing.id, chamberId);
        await dashboard(chamberPage, '/chamber');
        await card(chamberPage, sharedId)
          .getByText('Awaiting chamber allocation', { exact: true })
          .waitFor();
        await card(chamberPage, sharedId)
          .getByLabel('Available lawyer')
          .selectOption(w.lawyer2ProfileId);
        const allocation = chamberPage.waitForResponse((res) =>
          res.url().endsWith(`/requests/${sharedId}/actions`),
        );
        await card(chamberPage, sharedId)
          .getByRole('button', { name: 'Allocate substitute' })
          .click();
        expect((await allocation).status()).toBe(204);
        await dashboard(readerPage, '/admin/hearing-clashes');
        await card(readerPage, sharedId)
          .getByText('Awaiting Reader approval', { exact: true })
          .waitFor();
        await decide(readerPage, sharedId, 'READER_APPROVE');
        await dashboard(judgePage, '/judge/hearing-clashes');
        await card(judgePage, sharedId)
          .getByText('Awaiting judge approval', { exact: true })
          .waitFor();
        await decide(judgePage, sharedId, 'JUDGE_REJECT', 'Chamber nominee rejected by the judge.');
        await dashboard(lawyerPage, '/lawyer/hearing-clashes');
        await card(lawyerPage, sharedId)
          .getByText('Chamber nominee rejected by the judge.', { exact: true })
          .waitFor();

        const rejectedHearing = await hearing(9, new Date(workingDay(10)));
        const rejectedId = await submitClash(lawyerPage, rejectedHearing.id, 'private');
        await nominate(lawyerPage, rejectedId, w.lawyer2ProfileId);
        await dashboard(chamberPage, '/lawyer/hearing-clashes');
        await decide(chamberPage, rejectedId, 'DECLINE', 'I have a client conference.');
        await lawyerPage.reload();
        await card(lawyerPage, rejectedId).getByText('I have a client conference.', { exact: true }).waitFor();
        await nominate(lawyerPage, rejectedId, replacementId);
        await dashboard(nomineePage, '/lawyer/hearing-clashes');
        await decide(nomineePage, rejectedId, 'ACCEPT');
        await dashboard(readerPage, '/admin/hearing-clashes');
        await decide(readerPage, rejectedId, 'READER_REJECT', 'The alternative date is available.');
        await lawyerPage.reload();
        await card(lawyerPage, rejectedId).getByText('The alternative date is available.', { exact: true }).waitFor();
        await dashboard(judgePage, '/judge/hearing-clashes');
        await card(judgePage, sharedId).waitFor();
        expect(await card(judgePage, rejectedId).count()).toBe(0);

        const directHearing = await hearing(8);
        const directId = await submitClash(lawyerPage, directHearing.id, 'private');
        await dashboard(chamberPage, '/chamber');
        await card(chamberPage, sharedId).waitFor();
        expect(await card(chamberPage, directId).count()).toBe(0);
        await nominate(lawyerPage, directId, replacementId);
        await dashboard(readerPage, '/admin/hearing-clashes');
        await card(readerPage, sharedId).waitFor();
        expect(await card(readerPage, directId).count()).toBe(0);
        await dashboard(nomineePage, '/lawyer/hearing-clashes');
        await decide(nomineePage, directId, 'ACCEPT');
        await dashboard(readerPage, '/admin/hearing-clashes');
        await decide(readerPage, directId, 'READER_APPROVE');
        await dashboard(judgePage, '/judge/hearing-clashes');
        const approvalPath = `${base}/requests/${directId}/actions`;
        let committedStatus: number | undefined;
        await judgePage.route(`**${approvalPath}`, async (route) => {
          const result = await route.fetch({ url: `${testApi}${approvalPath}` });
          committedStatus = result.status();
          // The server committed the approval, but the browser loses the response before its UI updates.
          await route.abort('failed');
        }, { times: 1 });
        const interrupted = judgePage.waitForEvent('requestfailed', {
          predicate: (request) => request.url().endsWith(approvalPath),
        });
        const approving = card(judgePage, directId);
        await approving.getByLabel('Decision', { exact: false }).first().selectOption('JUDGE_APPROVE');
        await approving.getByRole('button', { name: 'Save decision' }).click();
        await interrupted;
        expect(committedStatus).toBe(204);
        await judgePage.reload();
        await card(judgePage, directId).getByText('Approved', { exact: true }).waitFor();
        await dashboard(lawyerPage, '/lawyer/hearing-clashes');
        await card(lawyerPage, directId).getByText('Approved', { exact: true }).waitFor();
        await dashboard(nomineePage, '/lawyer/hearing-clashes');
        await card(nomineePage, directId)
          .getByRole('link', { name: 'Open case documents' })
          .click();
        const pleadings = nomineePage.getByRole('table', { name: 'Pleadings' });
        const previewed = nomineePage.waitForResponse((res) => res.url().endsWith(pdf()));
        await pleadings.getByRole('button', { name: 'Preview pleading.pdf' }).click();
        expect((await previewed).status()).toBe(200);

        await dashboard(judgePage, `/judge/hearing-clashes?hearing=${directHearing.id}`);
        const absence = judgePage
          .getByRole('heading', { name: 'Record lawyer absence' })
          .locator('../..');
        await absence.getByLabel('Absent lawyer').selectOption(w.lawyerProfileId);
        const saved = judgePage.waitForResponse(
          (res) => res.url().endsWith(`${base}/absences`) && res.request().method() === 'POST',
        );
        await absence.getByRole('button', { name: 'Mark absent' }).click();
        expect((await saved).status()).toBe(204);
        await judgePage.getByText('Pending judge decision', { exact: true }).waitFor();
        await dashboard(readerPage, '/admin/hearing-clashes');
        await card(readerPage, directId).waitFor();
        expect(await readerPage.getByLabel('Fine amount (PKR)').count()).toBe(0);
        await absence.getByLabel('Absent lawyer').selectOption(replacementId);
        const closed = judgePage.waitForResponse(
          (res) => res.url().endsWith(`${base}/absences`) && res.request().method() === 'POST',
        );
        await absence.getByRole('button', { name: 'Mark absent' }).click();
        expect((await closed).status()).toBe(204);
        const records = await ctx.prisma.hearingAbsence.findMany({ where: { hearingId: directHearing.id } });
        for (const record of records) {
          const button = record.lawyerId === replacementId ? 'No Fine' : 'Impose Fine';
          const decision = judgePage.waitForResponse((res) => res.url().endsWith(`/absences/${record.id}/decision`));
          await judgePage.getByTestId(`hearing-absence-${record.id}`).getByRole('button', { name: button, exact: true }).click();
          expect((await decision).status()).toBe(204);
        }
        await dashboard(readerPage, '/admin/hearing-clashes');
        // Prior API fixtures may have finalized fines, so only the new pending form is editable.
        await readerPage.getByLabel('Fine amount (PKR)').fill('750.00');
        const fine = readerPage.waitForResponse((res) => res.url().endsWith('/fine'));
        await readerPage.getByRole('button', { name: 'Confirm Fine' }).click();
        expect((await fine).status()).toBe(204);
        const fined = await ctx.prisma.hearingAbsence.findFirstOrThrow({
          where: { hearingId: directHearing.id, lawyerId: w.lawyerProfileId },
        });
        expect(fined.fineAmount?.toFixed(2)).toBe('750.00');
        expect(
          await ctx.prisma.hearingAbsence.findFirst({
            where: { hearingId: directHearing.id, lawyerId: replacementId },
          }),
        ).toMatchObject({ fineRequired: false, fineAmount: null });
        await dashboard(judgePage, `/judge/cases/${caseId}`);
        await judgePage.getByRole('tab', { name: 'Hearings', exact: true }).click();
        await judgePage.getByText(/Fine recorded · PKR 750\.00/).waitFor();

        for (const [offset, flagBeforeReport] of [[8, true], [9, false]] as const) {
          const slot = await hearing(5, new Date(workingDay(offset)));
          if (!flagBeforeReport) {
            const id = await submitClash(lawyerPage, slot.id, 'private');
            await nominate(lawyerPage, id, replacementId);
            await dashboard(nomineePage, '/lawyer/hearing-clashes');
            await decide(nomineePage, id, 'ACCEPT');
          }
          await dashboard(readerPage, `/admin/hearing-clashes?hearing=${slot.id}`);
          await readerPage.getByRole('button', { name: 'Mark as last summons', exact: true }).click();
          await readerPage.getByText('Marked as last summons', { exact: true }).waitFor();
          if (flagBeforeReport) await submitClash(lawyerPage, slot.id);
          await dashboard(readerPage, `/admin/hearing-clashes?hearing=${slot.id}`);
          const required = readerPage.getByText('New hearing date required', { exact: true });
          await required.first().waitFor();
          await readerPage.getByRole('link', { name: 'Open Bench Scheduling' }).first().click();
          const dialog = readerPage.getByRole('dialog', { name: 'Reschedule hearing' });
          const newDay = workingDay(offset + 3);
          const displayed = newDay.split('-').reverse().join('-');
          await dialog.getByLabel('Date', { exact: true }).fill(displayed);
          await dialog.getByLabel('Time slot').selectOption('4');
          const savedDate = readerPage.waitForResponse((res) =>
            res.request().method() === 'PATCH' && res.url().endsWith(`/${slot.id}/reschedule`));
          await dialog.getByRole('button', { name: 'Reschedule', exact: true }).click();
          expect((await savedDate).status()).toBe(200);
          await dashboard(lawyerPage, '/lawyer/hearing-clashes');
          await lawyerPage.getByText(new RegExp(displayed)).first().waitFor();
        }
      } finally {
        await browser.close();
      }
    },
    180_000,
  );
});
