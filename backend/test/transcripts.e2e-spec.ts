import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocateDirect, anon, buildWorld, fileCase, login, PASSWORD } from './fixtures';
import { createTestApp, createUser, resetDatabase, TestContext } from './helpers';
import { openTestPortals } from './browser-fixture';

const openssl =
  process.env.TRANSCRIPT_OPENSSL_PATH ||
  (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
    ? 'C:/Program Files/Git/usr/bin/openssl.exe'
    : 'openssl');

describe('hearing transcript approval and certificate signing', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => ctx?.app.close());

  it('publishes the reviewed PDF only to assigned counsel after the assigned judge signs', async () => {
    const world = await buildWorld(ctx.prisma);
    const stenoUser = await createUser(ctx.prisma, {
      role: 'STENOGRAPHER',
      cnic: '36302-7070000-1',
      email: 'steno@qa.test',
      password: PASSWORD,
    });
    const [steno, judge, otherJudge, lawyer, lawyer2, otherLawyer, admin] = await Promise.all([
      login(ctx, stenoUser.email),
      ...['judge', 'judge2', 'lawyer', 'lawyer2', 'lawyerPending', 'admin'].map((key) =>
        login(ctx, world.emails[key]),
      ),
    ]);
    const { case: filed } = await fileCase(lawyer);
    await allocateDirect(ctx.prisma, filed.id, world);
    const respondent = await ctx.prisma.caseParty.findFirstOrThrow({
      where: { caseId: filed.id, role: 'RESPONDENT' },
    });
    await admin
      .patch(`/api/admin/cases/${filed.id}/parties/${respondent.id}/counsel`)
      .send({ barNumber: 'LH-1002' })
      .expect(200);
    const hearing = await ctx.prisma.hearing.create({
      data: {
        caseId: filed.id,
        judgeId: world.ids.judge,
        date: new Date('2026-11-24'),
        timeSlot: 1,
        startTime: '09:00',
        courtroomId: world.rooms.r1,
      },
    });
    const collection = '/api/hearing-transcripts';
    const resource = `${collection}/${hearing.id}`;
    const pdfUrl = `${resource}/pdf`;
    const listUrl = `${collection}?caseId=${filed.id}`;
    await admin
      .patch(`/api/admin/transcript-assignments/${hearing.id}`)
      .send({ stenographerId: stenoUser.id })
      .expect(200);
    expect((await steno.get(collection).expect(200)).body).toMatchObject([
      { id: hearing.id, status: 'DRAFT' },
    ]);

    await steno
      .put(`${resource}/draft`)
      .send({ text: 'First dictated statement.', revision: null })
      .expect(200);
    await steno
      .get(pdfUrl)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    await judge.get(pdfUrl).expect(404);
    const duplicateSubmissions = await Promise.all(
      [0, 0].map((revision) => steno.post(`${resource}/submit`).send({ revision })),
    );
    expect(duplicateSubmissions.map((response) => response.status).sort()).toEqual([201, 409]);
    await otherJudge.get(pdfUrl).expect(404);
    await otherJudge.post(`${resource}/approve`).send({ revision: 1 }).expect(404);
    await lawyer.get(pdfUrl).expect(404);
    await lawyer2.get(pdfUrl).expect(404);
    await judge.get(`${pdfUrl}?revision=1`).expect(200);
    await judge
      .post(`${resource}/return`)
      .send({ revision: 1, note: 'Use the corrected amount.' })
      .expect(201);
    expect((await steno.get(collection).expect(200)).body[0]).toMatchObject({
      status: 'RETURNED',
      correctionNote: 'Use the corrected amount.',
    });
    await steno
      .put(`${resource}/draft`)
      .send({ text: 'Corrected dictated statement.', revision: 2 })
      .expect(200);
    await steno.post(`${resource}/submit`).send({ revision: 3 }).expect(201);
    await judge.get(`${pdfUrl}?revision=1`).expect(409);

    const reviewed = await judge.get(`${pdfUrl}?revision=4`).expect(200);
    await judge.post(`${resource}/sign`).send({ revision: 4 }).expect(409);
    const duplicateApprovals = await Promise.all(
      [4, 4].map((revision) => judge.post(`${resource}/approve`).send({ revision })),
    );
    expect(duplicateApprovals.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await judge.get(pdfUrl).expect(200)).body).toEqual(reviewed.body);
    await steno
      .put(`${resource}/draft`)
      .send({ text: 'Unauthorized edit.', revision: 5 })
      .expect(409);
    for (const counsel of [lawyer, lawyer2]) {
      expect((await counsel.get(listUrl).expect(200)).body).toEqual([]);
      await counsel.get(pdfUrl).expect(404);
    }

    const previousDirectory = process.env.TRANSCRIPT_SIGNING_DIR;
    const previousOpenssl = process.env.TRANSCRIPT_OPENSSL_PATH;
    const directory = mkdtempSync(join(tmpdir(), 'transcript-signing-test-'));
    const judgeDirectory = join(directory, world.ids.judge);
    mkdirSync(judgeDirectory);
    const cert = join(judgeDirectory, 'certificate.pem');
    const key = join(judgeDirectory, 'private-key.pem');
    const cmsPath = join(directory, 'signature.der');
    const payloadPath = join(directory, 'pdf-byte-range.bin');
    process.env.TRANSCRIPT_SIGNING_DIR = directory;
    process.env.TRANSCRIPT_OPENSSL_PATH = openssl;
    try {
      await judge.post(`${resource}/sign`).send({ revision: 5 }).expect(503);
      await lawyer.get(pdfUrl).expect(404);
      const generated = spawnSync(openssl, [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=DigitalAdaalat Test Judge',
        '-keyout',
        key,
        '-out',
        cert,
      ]);
      expect(generated.status).toBe(0);
      const duplicateSignatures = await Promise.all(
        [5, 5].map((revision) => judge.post(`${resource}/sign`).send({ revision })),
      );
      expect(duplicateSignatures.map((response) => response.status).sort()).toEqual([201, 409]);
      for (const action of ['TRANSCRIPT_APPROVED', 'TRANSCRIPT_SIGNED']) {
        expect(await ctx.prisma.auditLog.count({ where: { entityId: hearing.id, action } })).toBe(1);
      }

      const signed = (await lawyer.get(pdfUrl).expect(200)).body as Buffer;
      expect((await lawyer2.get(pdfUrl).expect(200)).body).toEqual(signed);
      for (const counsel of [lawyer, lawyer2]) {
        expect((await counsel.get(listUrl).expect(200)).body).toMatchObject([
          { id: hearing.id, status: 'SIGNED' },
        ]);
      }
      await otherLawyer.get(pdfUrl).expect(404);
      expect((await otherLawyer.get(listUrl).expect(200)).body).toEqual([]);
      await anon(ctx).get(pdfUrl).expect(401);

      const raw = signed.toString('latin1');
      const ranges = /\/ByteRange \[0 (\d+) (\d+) (\d+)\]/.exec(raw);
      expect(ranges).not.toBeNull();
      const [firstEnd, lastStart, lastLength] = ranges!.slice(1).map(Number);
      expect(lastStart + lastLength).toBe(signed.length);
      expect(signed.length).toBe(reviewed.body.length);
      const contents = Buffer.from(raw.slice(firstEnd + 1, lastStart - 1), 'hex');
      // DER sequence length gives the CMS size without stripping legitimate trailing zero bytes.
      const lengthBytes = contents[1] & 0x7f;
      const cmsLength =
        contents[1] < 128 ? 2 + contents[1] : 2 + lengthBytes + contents.readUIntBE(2, lengthBytes);
      writeFileSync(cmsPath, contents.subarray(0, cmsLength));
      const payload = Buffer.concat([signed.subarray(0, firstEnd), signed.subarray(lastStart)]);
      writeFileSync(payloadPath, payload);
      const verify = spawnSync(
        openssl,
        [
          'cms',
          '-verify',
          '-binary',
          '-inform',
          'DER',
          '-in',
          cmsPath,
          '-content',
          payloadPath,
          '-CAfile',
          cert,
          '-purpose',
          'any',
        ],
        { encoding: 'utf8' },
      );
      expect({ status: verify.status, message: verify.stderr.trim() }).toEqual({
        status: 0,
        message: 'CMS Verification successful',
      });
      const tampered = Buffer.from(payload);
      tampered[20] ^= 1;
      writeFileSync(payloadPath, tampered);
      expect(
        spawnSync(openssl, [
          'cms',
          '-verify',
          '-binary',
          '-inform',
          'DER',
          '-in',
          cmsPath,
          '-content',
          payloadPath,
          '-CAfile',
          cert,
          '-purpose',
          'any',
        ]).status,
      ).not.toBe(0);
      const stored = await ctx.prisma.hearingTranscript.findUniqueOrThrow({
        where: { hearingId: hearing.id },
      });
      expect(stored).toMatchObject({
        submittedById: stenoUser.id,
        approvedById: world.ids.judge,
        signedById: world.ids.judge,
        reviewPdfSha256: createHash('sha256').update(reviewed.body).digest('hex'),
        signedPdfSha256: createHash('sha256').update(signed).digest('hex'),
        submittedAt: expect.any(Date),
        approvedAt: expect.any(Date),
        signedAt: expect.any(Date),
        signingFingerprint: expect.any(String),
      });

      const web = process.env.COVERAGE_BROWSER_URL;
      if (web) {
        const portalHearing = await ctx.prisma.hearing.create({
          data: {
            caseId: filed.id,
            judgeId: world.ids.judge,
            date: new Date('2026-11-25'),
            timeSlot: 2,
            startTime: '09:30',
            courtroomId: world.rooms.r1,
          },
        });
        const { browser, signIn } = await openTestPortals(ctx, web);
        try {
          const readerPage = await signIn(world.emails.admin);
          const stenoPage = await signIn(stenoUser.email);
          const judgePage = await signIn(world.emails.judge);
          const counsel = await Promise.all([signIn(world.emails.lawyer), signIn(world.emails.lawyer2)]);
          const lawyerTab = async (page: typeof stenoPage) => {
            await page.goto(`${web}/lawyer/cases/${filed.id}`);
            await page.getByRole('tab', { name: /transcripts/i }).click();
          };
          const statements = stenoPage.getByLabel('Dictated statements');
          await readerPage.goto(`${web}/admin/transcript-assignments`);
          const assignment = readerPage.getByText(/25-11-2026 09:30/).locator('../..');
          await assignment.getByRole('combobox', { name: 'Stenographer' }).selectOption(stenoUser.id);
          await assignment.getByRole('button', { name: 'Assign stenographer' }).click();
          await readerPage.getByText('Stenographer assigned.', { exact: true }).waitFor();
          await stenoPage.goto(`${web}/stenographer`);
          await statements.fill('Dictated statement for portal verification.');
          await stenoPage.getByRole('button', { name: 'Save draft' }).click();
          await stenoPage.getByText('Draft saved.', { exact: true }).waitFor();
          await stenoPage.reload();
          expect(await statements.inputValue()).toBe('Dictated statement for portal verification.');
          await stenoPage.getByRole('button', { name: 'Submit for review' }).click();
          await stenoPage.getByText('Submitted for Review', { exact: true }).waitFor();

          await judgePage.goto(`${web}/judge/transcripts`);
          const preview = judgePage.waitForResponse((res) =>
            res.url().includes(`/${portalHearing.id}/pdf`));
          await judgePage.getByText('Submitted for Review', { exact: true }).locator('../../..')
            .getByRole('button', { name: 'Preview', exact: true }).click();
          expect((await preview).ok()).toBe(true);
          await judgePage.getByRole('button', { name: 'Close preview' }).click();
          const correction = 'Correct the stated amount before resubmitting.';
          await judgePage.getByRole('button', { name: 'Return for correction', exact: true }).click();
          await judgePage.getByLabel('Correction note').fill(correction);
          await judgePage.getByRole('button', { name: 'Return for correction', exact: true }).click();
          await judgePage.getByText('Returned for Correction', { exact: true }).waitFor();
          await stenoPage.reload();
          await stenoPage.getByText(correction, { exact: true }).waitFor();
          await statements.fill('Corrected dictated statement for portal verification.');
          await stenoPage.getByRole('button', { name: 'Save draft' }).click();
          await stenoPage.getByRole('button', { name: 'Submit for review' }).click();
          await stenoPage.getByText('Submitted for Review', { exact: true }).waitFor();
          await judgePage.reload();
          // Let the backing request commit, then reload before the original tab sees its response.
          let approvalFinished!: (status: number) => void;
          let releaseApproval!: () => void;
          const committed = new Promise<number>((resolve) => { approvalFinished = resolve; });
          const allowResponse = new Promise<void>((resolve) => { releaseApproval = resolve; });
          const approvalPath = `${collection}/${portalHearing.id}/approve`;
          const testApi = await ctx.app.getUrl();
          await judgePage.route(`**${approvalPath}`, async (route) => {
            const response = await route.fetch({ url: `${testApi}${approvalPath}`, timeout: 10_000 })
              .catch(() => undefined);
            approvalFinished(response?.status() ?? 0);
            await allowResponse;
            if (response) await route.fulfill({ response }).catch(() => undefined);
            else await route.abort().catch(() => undefined);
          }, { times: 1 });
          try {
            await judgePage.getByRole('button', { name: 'Approve', exact: true }).click();
            expect(await committed).toBe(201);
            await judgePage.reload();
          } finally {
            releaseApproval();
          }
          const sign = judgePage.getByRole('button', { name: 'Digitally sign and publish' });
          await sign.waitFor();
          for (const page of counsel) {
            await lawyerTab(page);
            expect(await page.evaluate(async (path) => (await fetch(path)).status,
              `${collection}/${portalHearing.id}/pdf`)).toBe(404);
          }
          await sign.click();
          await sign.waitFor({ state: 'hidden' });
          const portalSigned = await ctx.prisma.hearingTranscript.findUniqueOrThrow({
            where: { hearingId: portalHearing.id },
          });
          expect(portalSigned.status).toBe('SIGNED');
          expect(portalSigned.signedPdfSha256).toMatch(/^[0-9a-f]{64}$/);
          for (const page of counsel) {
            await lawyerTab(page);
            const signedCard = page.getByText(/25-11-2026 09:30/).locator('../../..');
            await signedCard.getByText('Signed', { exact: true }).waitFor();
            const downloaded = page.waitForEvent('download');
            await signedCard.getByRole('button', { name: 'Download PDF' }).click();
            const file = await downloaded;
            expect(file.suggestedFilename()).toMatch(/\.pdf$/);
            expect(createHash('sha256').update(readFileSync(await file.path())).digest('hex'))
              .toBe(portalSigned.signedPdfSha256);
          }
        } finally {
          await browser.close();
        }
      }
    } finally {
      if (previousDirectory === undefined) delete process.env.TRANSCRIPT_SIGNING_DIR;
      else process.env.TRANSCRIPT_SIGNING_DIR = previousDirectory;
      if (previousOpenssl === undefined) delete process.env.TRANSCRIPT_OPENSSL_PATH;
      else process.env.TRANSCRIPT_OPENSSL_PATH = previousOpenssl;
      for (const file of [cmsPath, payloadPath, cert, key]) if (existsSync(file)) unlinkSync(file);
      rmdirSync(judgeDirectory);
      rmdirSync(directory);
    }
  }, 160_000);
});
