import { allocateDirect, Api, buildWorld, fileCase, login, PASSWORD, workingDay } from './fixtures';
import { createTestApp, createUser, pdfBuffer, resetDatabase, TestContext } from './helpers';
import { openTestPortals } from './browser-fixture';

describe('document delivery and Reader review (e2e)', () => {
  let ctx: TestContext;
  let admin: Api;
  let judge: Api;
  let otherJudge: Api;
  let officer: Api;
  let otherOfficer: Api;
  let otherOfficerId: string;
  let officerId: string;
  let caseId: string;
  let documentId: string;
  let portalDocumentId: string;
  let recipients: string[];
  const hearingDate = workingDay(2);
  const address = '12 Court Road, Multan';
  const correctedAddress = '19 Court Road, Multan';
  const document = pdfBuffer('delivery notice');
  const proof = pdfBuffer('recipient acknowledgment');

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    const world = await buildWorld(ctx.prisma);
    const alternative = await createUser(ctx.prisma, {
      role: 'PROCESS_SERVER',
      email: 'second-officer@qa.test',
      cnic: '36302-1999888-8',
      password: PASSWORD,
    });
    await ctx.prisma.processServerProfile.create({
      data: {
        userId: alternative.id,
        courtId: world.courtId,
        sector: 'North',
        badgeNumber: 'PS-SECOND',
      },
    });
    otherOfficerId = alternative.id;
    officerId = world.ids.server;
    const filer = await login(ctx, world.emails.lawyer);
    const litigant = await ctx.prisma.user.findUniqueOrThrow({ where: { id: world.ids.litigant } });
    [admin, judge, otherJudge, officer, otherOfficer] = await Promise.all([
      login(ctx, world.emails.admin),
      login(ctx, world.emails.judge),
      login(ctx, world.emails.judge2),
      login(ctx, world.emails.server),
      login(ctx, alternative.email),
    ]);
    const filed = await fileCase(
      filer,
      {
        petitioners: [{ name: `${litigant.firstName} ${litigant.lastName}`, cnic: litigant.cnic }],
        respondents: [
          { name: 'First recipient', address },
          { name: 'Second recipient', address },
        ],
      },
      [{ name: 'notice.pdf', content: document }, { name: 'portal-notice.pdf', content: document }],
    );
    caseId = filed.case.id;
    await allocateDirect(ctx.prisma, caseId, world);
    await ctx.prisma.hearing.create({
      data: {
        caseId,
        judgeId: world.ids.judge,
        courtroomId: world.rooms.r1,
        date: new Date(hearingDate),
        timeSlot: 1,
        startTime: '09:00',
      },
    });
    const options = await admin.get(`/api/admin/cases/${caseId}/delivery-options`).expect(200);
    expect(options.body.hearingDate).toBe(hearingDate);
    documentId = options.body.documents.find((item: { originalName: string }) => item.originalName === 'notice.pdf').id;
    portalDocumentId = options.body.documents.find(
      (item: { originalName: string }) => item.originalName === 'portal-notice.pdf',
    ).id;
    recipients = options.body.recipients
      .filter((p: { role: string }) => p.role === 'RESPONDENT')
      .map((p: { id: string }) => p.id);
  });

  afterAll(async () => ctx?.app.close());

  const caseDeliveries = () => `/api/admin/cases/${caseId}/deliveries`;
  const judgeDeliveries = () => `/api/judge/cases/${caseId}/deliveries`;
  const server = (id: string) => `/api/server/deliveries/${id}`;
  const assign = (index: number) =>
    admin.post(caseDeliveries()).send({
      documentId,
      recipientId: recipients[index],
      address,
      serverId: officerId,
      dueDate: hearingDate,
    });
  const start = (actor: Api, id: string, version: number) =>
    actor
      .post(`${server(id)}/start`)
      .send({ version })
      .expect(204);
  const report = (actor: Api, id: string, version: number, outcome: string) => {
    const base = actor
      .post(`${server(id)}/report`)
      .field('version', String(version))
      .field('outcome', outcome)
      .field('occurredAt', new Date().toISOString())
      .field('remarks', 'Visit recorded by the officer.');
    return outcome === 'DELIVERED'
      ? base.field('receivedBy', 'First recipient').attach('acknowledgment', proof, 'ack.pdf')
      : base.field('reason', 'Visit outcome confirmed at the address.');
  };
  const review = (id: string, version: number, action: string, fields: object = {}) =>
    admin
      .post(`/api/admin/deliveries/${id}/review`)
      .send({ version, action, ...fields })
      .expect(204);

  it('tracks recipients independently and preserves reviewed and repeated visits, including refusal', async () => {
    const first = (await assign(0).expect(201)).body.id as string;
    const second = (await assign(1).expect(201)).body.id as string;
    expect(first).not.toBe(second);
    await assign(0).expect(409);
    const roster = (await officer.get('/api/server/deliveries').expect(200)).body;
    expect(roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first,
          recipientName: 'First recipient',
          dueDate: hearingDate,
          hearingDate,
        }),
        expect.objectContaining({
          id: second,
          recipientName: 'Second recipient',
          dueDate: hearingDate,
          hearingDate,
        }),
      ]),
    );
    expect((await otherOfficer.get('/api/server/deliveries').expect(200)).body).toEqual([]);
    await otherOfficer.get(`${server(first)}/document`).expect(404);
    await otherOfficer
      .post(`${server(first)}/start`)
      .send({ version: 0 })
      .expect(404);
    expect((await officer.get(`${server(first)}/document`).expect(200)).body).toEqual(document);

    await admin.post(`${server(first)}/start`).send({ version: 0 }).expect(403);
    await report(officer, first, 0, 'DELIVERED').expect(409);
    await start(officer, first, 0);
    await officer.post(`${server(first)}/report`)
      .field('version', '1')
      .field('outcome', 'REFUSED')
      .field('occurredAt', new Date().toISOString())
      .expect(400);
    await officer.post(`${server(first)}/report`)
      .field('version', '1')
      .field('outcome', 'DELIVERED')
      .field('receivedBy', 'First recipient')
      .field('occurredAt', new Date(Date.now() + 86_400_000).toISOString())
      .expect(400);
    await report(officer, first, 1, 'DELIVERED').expect(204);
    await report(officer, first, 1, 'DELIVERED').expect(409);
    const pending = (await admin.get(caseDeliveries()).expect(200)).body.find(
      (d: { id: string }) => d.id === first,
    );
    const attemptId = pending.attempts[0].id;
    const acknowledgment = `/api/deliveries/${first}/attempts/${attemptId}/acknowledgment`;
    expect(pending.attempts[0]).toMatchObject({
      outcome: 'DELIVERED',
      receivedBy: 'First recipient',
      acknowledgmentType: 'application/pdf',
    });
    await officer.post(`/api/admin/deliveries/${first}/review`)
      .send({ version: 2, action: 'ACCEPT' })
      .expect(403);
    expect((await judge.get(judgeDeliveries()).expect(200)).body).toEqual([]);
    await judge.get(acknowledgment).expect(404);
    await review(first, 2, 'REQUEST_CLARIFICATION', { note: 'Confirm where delivery occurred.' });
    await officer
      .post(`${server(first)}/clarification`)
      .send({ version: 3, note: 'At the confirmed entrance.' })
      .expect(204);
    await review(first, 4, 'ACCEPT');
    expect((await judge.get(acknowledgment).expect(200)).body).toEqual(proof);
    await otherJudge.get(acknowledgment).expect(404);
    await otherJudge.get(judgeDeliveries()).expect(404);
    await otherOfficer.get(`${server(first)}/attempts/${attemptId}/acknowledgment`).expect(404);
    await review(first, 5, 'FORWARD');
    expect(
      await ctx.prisma.caseEvent.count({ where: { caseId, type: 'DELIVERY_REPORT_FORWARDED' } }),
    ).toBe(1);

    await start(officer, second, 0);
    await report(officer, second, 1, 'INCORRECT_ADDRESS').expect(204);
    await review(second, 2, 'RETRY', {
      address: correctedAddress,
      serverId: otherOfficerId,
      dueDate: hearingDate,
    });
    await officer.get(`${server(second)}/document`).expect(404);
    expect((await otherOfficer.get(`${server(second)}/document`).expect(200)).body).toEqual(
      document,
    );
    await start(otherOfficer, second, 3);
    await report(otherOfficer, second, 4, 'UNAVAILABLE').expect(204);
    await review(second, 5, 'RETRY');
    await start(otherOfficer, second, 6);
    await report(otherOfficer, second, 7, 'REFUSED').expect(204);
    await review(second, 8, 'ACCEPT');

    const reviewed = (await judge.get(judgeDeliveries()).expect(200)).body;
    const delivered = reviewed.find((d: { id: string }) => d.id === first);
    const refused = reviewed.find((d: { id: string }) => d.id === second);
    expect(delivered.attempts[0].reviews.map((r: { action: string }) => r.action)).toEqual([
      'REQUEST_CLARIFICATION',
      'CLARIFICATION_REPLY',
      'ACCEPT',
      'FORWARD',
    ]);
    expect(
      refused.attempts.map((a: { outcome: string; address: string }) => [a.outcome, a.address]),
    ).toEqual([
      ['REFUSED', correctedAddress],
      ['UNAVAILABLE', correctedAddress],
      ['INCORRECT_ADDRESS', address],
    ]);
    expect(refused.attempts[0].receivedBy).toBeNull();
    expect(refused.status).toBe('REVIEWED');
  }, 60_000);

  const browserTest = process.env.COVERAGE_BROWSER_URL ? it : it.skip;
  browserTest('keeps two recipients and repeated visits separate through the Reader, officer and Judge portals', async () => {
    const web = process.env.COVERAGE_BROWSER_URL!;
    const world = {
      reader: 'admin@qa.test',
      officer: 'server@qa.test',
      judge: 'judge@qa.test',
    };
    const { browser, signIn } = await openTestPortals(ctx, web);
    try {
      const officerPage = await signIn(world.officer);
      const alternatePage = await signIn('second-officer@qa.test');
      const readerPage = await signIn(world.reader);
      const judgePage = await signIn(world.judge);
      const caseTabs = async (page: typeof readerPage, portal: string) => {
        await page.goto(`${web}/${portal}/cases/${caseId}`);
        await page.getByRole('tab', { name: 'Deliveries', exact: true }).click();
      };
      await caseTabs(readerPage, 'admin');
      const assignment = readerPage.getByRole('heading', { name: 'Assign document delivery' }).locator('../..');
      const firstAddress = '21 Bosan Road, Multan';
      const badAddress = '8 Old Shujabad Road, Multan';
      const newAddress = '18 Old Shujabad Road, Multan';
      const firstName = 'First recipient';
      const secondName = 'Second recipient';
      const makeDelivery = async (index: number, street: string) => {
        await assignment.getByRole('combobox', { name: 'Document', exact: true }).selectOption(portalDocumentId);
        await assignment.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption(recipients[index]);
        await assignment.getByLabel('Process Server').selectOption(officerId);
        await assignment.getByLabel('Confirm delivery address').fill(street);
        await assignment.getByLabel('Due date').fill(hearingDate);
        const pending = readerPage.waitForResponse((res) =>
          res.request().method() === 'POST' && res.url().endsWith(`/cases/${caseId}/deliveries`));
        await assignment.getByRole('button', { name: 'Assign delivery' }).click();
        const created = await pending;
        expect(created.status()).toBe(201);
        return (await created.json()).id as string;
      };
      const first = await makeDelivery(0, firstAddress);
      const second = await makeDelivery(1, badAddress);
      expect(first).not.toBe(second);
      const card = (page: typeof readerPage, recipient: string) =>
        page.getByRole('heading', { name: recipient, exact: true }).locator('../../..').filter({
          has: page.getByText('portal-notice.pdf', { exact: true }),
        });
      const openRoster = (page: typeof officerPage) => page.goto(`${web}/process-server/deliveries`);
      const directStatus = (page: typeof officerPage, path: string) => page.evaluate(async (url) =>
        (await fetch(url)).status, path);
      const submitReport = async (
        page: typeof officerPage, recipient: string, id: string, outcome: string, detail: string,
      ) => {
        const delivery = card(page, recipient);
        await delivery.getByRole('button', { name: 'Mark out for delivery' }).click();
        await delivery.getByLabel('Delivery outcome').selectOption(outcome);
        if (outcome === 'DELIVERED') {
          await delivery.getByLabel('Received by').fill(detail);
          await delivery.getByLabel('Acknowledgment (optional)').setInputFiles({
            name: 'signed-acknowledgment.pdf', mimeType: 'application/pdf', buffer: proof,
          });
        } else {
          await delivery.getByLabel('Reason').fill(detail);
        }
        const pending = page.waitForResponse((res) => res.url().endsWith(`/${id}/report`));
        await delivery.getByRole('button', { name: 'Submit delivery report' }).click();
        expect((await pending).status()).toBe(204);
      };
      const reviewInPortal = async (recipient: string, id: string, action: string) => {
        const delivery = card(readerPage, recipient);
        const pending = readerPage.waitForResponse((res) => res.url().endsWith(`/${id}/review`));
        await delivery.getByRole('button', { name: 'Submit review' }).click();
        expect((await pending).status()).toBe(204);
        await delivery.locator('details').first().getByText(action, { exact: true }).waitFor();
      };

      await openRoster(officerPage);
      await openRoster(alternatePage);
      expect(await directStatus(alternatePage, `${server(first)}/document`)).toBe(404);
      expect(await directStatus(officerPage, `${server(first)}/document`)).toBe(200);
      await submitReport(officerPage, firstName, first, 'DELIVERED', 'Farah Akram');
      await submitReport(officerPage, secondName, second, 'INCORRECT_ADDRESS', 'The listed house number does not exist.');
      await caseTabs(readerPage, 'admin');
      const firstCard = card(readerPage, firstName);
      const secondCard = card(readerPage, secondName);
      await firstCard.getByText(/Farah Akram/).waitFor();
      await firstCard.getByRole('button', { name: 'View acknowledgment' }).waitFor();
      await firstCard.getByLabel('Review action').selectOption('ACCEPT');
      await reviewInPortal(firstName, first, 'Report accepted');
      await secondCard.getByText(/listed house number does not exist/).waitFor();
      await secondCard.getByLabel('Review action').selectOption('RETRY');
      await secondCard.getByLabel('Confirm delivery address').fill(newAddress);
      await secondCard.getByLabel('Process Server').selectOption(otherOfficerId);
      await reviewInPortal(secondName, second, 'Another attempt assigned');

      await openRoster(officerPage);
      await openRoster(alternatePage);
      expect(await directStatus(officerPage, `${server(second)}/document`)).toBe(404);
      expect(await directStatus(alternatePage, `${server(second)}/document`)).toBe(200);
      await card(alternatePage, secondName).locator('dd').filter({ hasText: newAddress }).waitFor();
      await submitReport(alternatePage, secondName, second, 'UNAVAILABLE', 'Nobody answered at the corrected address.');
      await caseTabs(readerPage, 'admin');
      await secondCard.getByText(/Nobody answered at the corrected address/).waitFor();
      await secondCard.getByLabel('Review action').selectOption('RETRY');
      await reviewInPortal(secondName, second, 'Another attempt assigned');

      await openRoster(alternatePage);
      await submitReport(alternatePage, secondName, second, 'REFUSED', 'Recipient declined to take the notice.');
      await caseTabs(readerPage, 'admin');
      await secondCard.getByText(/Recipient declined to take the notice/).waitFor();
      await secondCard.getByLabel('Review action').selectOption('ACCEPT');
      await reviewInPortal(secondName, second, 'Report accepted');

      await caseTabs(judgePage, 'judge');
      await card(judgePage, firstName).getByText(/Farah Akram/).waitFor();
      await judgePage.reload();
      await judgePage.getByRole('tab', { name: 'Deliveries', exact: true }).click();
      const delivered = card(judgePage, firstName);
      const refused = card(judgePage, secondName);
      await delivered.getByText('Report accepted', { exact: true }).waitFor();
      await refused.getByText('Report accepted', { exact: true }).waitFor();
      expect(await delivered.locator('summary').count()).toBe(1);
      expect(await refused.locator('summary').count()).toBe(3);
      expect(await refused.locator('summary').allTextContents()).toEqual([
        expect.stringContaining('Refused'),
        expect.stringContaining('Recipient unavailable'),
        expect.stringContaining('Address incorrect or incomplete'),
      ]);
      await refused.getByText(/Address incorrect or incomplete/).click();
      await refused.getByText(badAddress, { exact: true }).waitFor();
      await refused.locator('dd').filter({ hasText: newAddress }).waitFor();
      expect(await refused.getByRole('button', { name: 'View acknowledgment' }).count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 180_000);
});
