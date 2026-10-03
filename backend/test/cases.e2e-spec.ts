import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service';
import { Messages } from '../src/common/messages';
import { UCN_REGEX } from '../src/cases/ucn';
import {
  createTestApp,
  createUser,
  pdfBuffer,
  resetDatabase,
  TestContext,
  validCase,
  validRegistration,
} from './helpers';
import { TEST_UPLOAD_DIR, TEST_UPLOAD_TMP_DIR } from './setup-env';
import { rmSync } from 'node:fs';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('Cases (e2e)', () => {
  let ctx: TestContext;
  const server = () => ctx.app.getHttpServer();

  const login = async (identifier: string, password: string) => {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  };

  /** POST /api/cases as multipart: a `data` JSON field plus any number of files. */
  const submit = (
    agent: ReturnType<typeof request.agent>,
    data: unknown,
    files: { name: string; content: Buffer }[] = [],
  ) => {
    let req = agent.post('/api/cases');
    if (data !== undefined)
      req = req.field('data', typeof data === 'string' ? data : JSON.stringify(data));
    for (const f of files) req = req.attach('files', f.content, f.name);
    return req;
  };

  const storedFiles = (): string[] => {
    const root = join(TEST_UPLOAD_DIR, 'cases');
    if (!existsSync(root)) return [];
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  };
  const tempLeftovers = async (): Promise<string[]> => {
    // The interceptor deletes temp files as the request finishes; allow a moment for that.
    for (let i = 0; i < 20; i++) {
      const left = existsSync(TEST_UPLOAD_TMP_DIR) ? readdirSync(TEST_UPLOAD_TMP_DIR) : [];
      if (left.length === 0) return left;
      await new Promise((r) => setTimeout(r, 50));
    }
    return readdirSync(TEST_UPLOAD_TMP_DIR);
  };

  let litigant: ReturnType<typeof request.agent>;
  let lawyer: ReturnType<typeof request.agent>;
  let litigantB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    await resetDatabase(ctx.prisma);

    await request(server()).post('/api/auth/register').send(validRegistration()).expect(201);
    await request(server())
      .post('/api/auth/register')
      .send(
        validRegistration({
          email: 'bilal@example.test',
          cnic: '36302-3333333-3',
          firstName: 'Bilal',
          lastName: 'Other',
        }),
      )
      .expect(201);
    await request(server())
      .post('/api/auth/register')
      .send(
        validRegistration({
          role: 'LAWYER',
          email: 'lawyer@example.test',
          cnic: '36302-4444444-4',
          firstName: 'Hamza',
          lastName: 'Bukhari',
          barNumber: 'MBA-1',
        }),
      )
      .expect(201);

    litigant = await login('ayesha@example.test', 'Passw0rdTest');
    litigantB = await login('bilal@example.test', 'Passw0rdTest');
    lawyer = await login('lawyer@example.test', 'Passw0rdTest');
  });

  describe('POST /api/cases', () => {
    it('submits a case with two PDFs, generates the UCN and records everything', async () => {
      const a = pdfBuffer('petition');
      const b = pdfBuffer('affidavit');
      const res = await submit(litigant, validCase({ title: 'Ayesha vs. Bilal' }), [
        { name: 'Petition.pdf', content: a },
        { name: 'Affidavit.PDF', content: b },
      ]).expect(201);

      expect(res.body.message).toBe(Messages.CASE_SUBMITTED);
      expect(res.body.case.ucn).toMatch(UCN_REGEX);
      expect(res.body.case.ucn).toMatch(/^DA-\d{4}-CIV-000001$/);
      expect(res.body.case.status).toBe('PENDING_ASSIGNMENT');
      expect(res.body.case.documentCount).toBe(2);

      const row = await ctx.prisma.case.findUniqueOrThrow({
        where: { id: res.body.case.id },
        include: { parties: true, documents: true, events: { orderBy: { createdAt: 'asc' } } },
      });
      expect(row.parties.map((p) => p.role).sort()).toEqual(['PETITIONER', 'RESPONDENT']);
      expect(row.documents.map((d) => d.sha256).sort()).toEqual([sha256(a), sha256(b)].sort());
      expect(
        row.documents.every(
          (d) => d.filePath.startsWith(`cases/${row.id}/`) && d.filePath.endsWith('.pdf'),
        ),
      ).toBe(true);
      expect(row.documents.map((d) => d.originalName).sort()).toEqual([
        'Affidavit.PDF',
        'Petition.pdf',
      ]);
      expect(row.events.map((e) => e.type)).toEqual([
        'CASE_SUBMITTED',
        'DOCUMENT_ATTACHED',
        'DOCUMENT_ATTACHED',
      ]);
      expect(storedFiles()).toHaveLength(2);
      expect(
        await ctx.prisma.auditLog.count({ where: { action: 'CASE_SUBMITTED', entityId: row.id } }),
      ).toBe(1);
      expect(await tempLeftovers()).toEqual([]);
    });

    it('stores files under random names, never the client file name', async () => {
      const res = await submit(litigant, validCase(), [
        { name: '../../evil name.pdf', content: pdfBuffer() },
      ]).expect(201);
      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({
        where: { caseId: res.body.case.id },
      });
      expect(doc.filePath).toMatch(/^cases\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
      expect(doc.originalName).not.toContain('/');
      expect(doc.originalName).not.toContain('..');
    });

    it('generates "<Petitioner> vs. <Respondent>" when no title is given, and keeps a given title', async () => {
      const auto = await submit(litigant, validCase()).expect(201);
      expect(auto.body.case.title).toBe('Ayesha Siddiqui vs. Bilal Ahmed');
      const many = await submit(
        litigant,
        validCase({
          petitioners: [{ name: 'A One' }, { name: 'B Two' }],
          respondents: [{ name: 'The State' }],
        }),
      ).expect(201);
      expect(many.body.case.title).toBe('A One & others vs. The State');
      const given = await submit(litigant, validCase({ title: 'Custom title' })).expect(201);
      expect(given.body.case.title).toBe('Custom title');
    });

    it('works without any files', async () => {
      const res = await submit(litigant, validCase()).expect(201);
      expect(res.body.case.documentCount).toBe(0);
    });

    it("fills a litigant's own CNIC and phone on the first petitioner when it is them", async () => {
      const res = await submit(litigant, validCase()).expect(201);
      const p = await ctx.prisma.caseParty.findFirstOrThrow({
        where: { caseId: res.body.case.id, role: 'PETITIONER' },
      });
      expect(p.cnic).toBe('36302-1111111-1');
      expect(p.lawyerId).toBeNull();
    });

    it('records the lawyer as counsel on petitioner parties only', async () => {
      const res = await submit(lawyer, validCase()).expect(201);
      const profile = await ctx.prisma.lawyerProfile.findFirstOrThrow({
        where: { user: { email: 'lawyer@example.test' } },
      });
      const parties = await ctx.prisma.caseParty.findMany({ where: { caseId: res.body.case.id } });
      expect(
        parties.filter((p) => p.role === 'PETITIONER').every((p) => p.lawyerId === profile.id),
      ).toBe(true);
      expect(parties.filter((p) => p.role === 'RESPONDENT').every((p) => p.lawyerId === null)).toBe(
        true,
      );
    });

    describe('validation', () => {
      it('answers "Incomplete case details." when mandatory fields are missing, with per-field errors', async () => {
        const res = await submit(litigant, { caseType: 'CIVIL_SUIT' }).expect(400);
        expect(res.body.message).toBe(Messages.CASE_INCOMPLETE);
        const fields = res.body.details.map((d: { field: string }) => d.field);
        expect(fields).toEqual(
          expect.arrayContaining(['reliefSought', 'petitioners', 'respondents']),
        );
        expect(await ctx.prisma.case.count()).toBe(0);
      });

      it.each([
        ['no data field at all', undefined],
        ['data that is not JSON', 'not json'],
        ['empty case type', validCase({ caseType: '' })],
        ['blank relief sought', validCase({ reliefSought: '   ' })],
        ['relief sought under 20 characters', validCase({ reliefSought: 'too short' })],
        ['a petitioner without a name', validCase({ petitioners: [{ name: '' }] })],
        ['a respondent without a name', validCase({ respondents: [{ name: '  ' }] })],
        ['no respondents', validCase({ respondents: [] })],
      ])('rejects %s with "Incomplete case details."', async (_name, data) => {
        const res = await submit(litigant, data as never).expect(400);
        expect(res.body.message).toBe(Messages.CASE_INCOMPLETE);
        expect(await ctx.prisma.case.count()).toBe(0);
      });

      it('rejects relief sought over 5000 characters and unknown case types', async () => {
        await submit(litigant, validCase({ reliefSought: 'x'.repeat(5001) })).expect(400);
        const res = await submit(litigant, validCase({ caseType: 'MURDER_TRIAL' })).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FIELDS);
      });

      it('rejects invalid CNIC and phone formats on parties', async () => {
        const res = await submit(
          litigant,
          validCase({
            respondents: [{ name: 'Bilal', cnic: '3630222222222', phone: '03217654321' }],
          }),
        ).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FIELDS);
        const fields = res.body.details.map((d: { field: string }) => d.field);
        expect(fields).toEqual(
          expect.arrayContaining(['respondents.0.cnic', 'respondents.0.phone']),
        );
      });

      it('treats blank optional CNIC, phone and address as absent', async () => {
        await submit(
          litigant,
          validCase({ respondents: [{ name: 'Bilal', cnic: '', phone: '', address: '' }] }),
        ).expect(201);
      });

      it('rejects unknown properties', async () => {
        await submit(litigant, validCase({ status: 'DECIDED', judgeId: 'x' })).expect(400);
      });
    });

    describe('case_registration_open setting', () => {
      it('closes registration when set to false, and reopens it', async () => {
        await ctx.prisma.systemSetting.create({
          data: { key: 'case_registration_open', value: 'false' },
        });
        const res = await submit(litigant, validCase()).expect(403);
        expect(res.body.message).toBe(Messages.CASE_REGISTRATION_CLOSED);
        expect(res.body.code).toBe('REGISTRATION_CLOSED');
        expect(await ctx.prisma.case.count()).toBe(0);

        await ctx.prisma.systemSetting.update({
          where: { key: 'case_registration_open' },
          data: { value: 'true' },
        });
        await submit(litigant, validCase()).expect(201);
      });
    });

    describe('UCN', () => {
      it('is unique and sequential across 20 parallel submissions', async () => {
        const results = await Promise.all(
          Array.from({ length: 20 }, () => submit(litigant, validCase())),
        );
        expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
        const ucns = results.map((r) => r.body.case.ucn as string);
        expect(new Set(ucns).size).toBe(20);
        expect(ucns.every((u) => UCN_REGEX.test(u))).toBe(true);
        const sequences = ucns.map((u) => Number(u.slice(-6))).sort((a, b) => a - b);
        expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      });

      it('keeps a separate sequence per case type, using the type code', async () => {
        const civil1 = await submit(litigant, validCase()).expect(201);
        const bail1 = await submit(litigant, validCase({ caseType: 'BAIL_APPLICATION' })).expect(
          201,
        );
        const writ1 = await submit(litigant, validCase({ caseType: 'WRIT_PETITION' })).expect(201);
        const crim1 = await submit(litigant, validCase({ caseType: 'CRIMINAL_APPEAL' })).expect(
          201,
        );
        const civil2 = await submit(litigant, validCase()).expect(201);
        const year = new Date().getUTCFullYear();
        expect(civil1.body.case.ucn).toBe(`DA-${year}-CIV-000001`);
        expect(bail1.body.case.ucn).toBe(`DA-${year}-BAL-000001`);
        expect(writ1.body.case.ucn).toBe(`DA-${year}-WRT-000001`);
        expect(crim1.body.case.ucn).toBe(`DA-${year}-CRA-000001`);
        expect(civil2.body.case.ucn).toBe(`DA-${year}-CIV-000002`);
      });

      it('does not burn a number when a submission fails validation', async () => {
        await submit(litigant, validCase({ reliefSought: 'short' })).expect(400);
        const ok = await submit(litigant, validCase()).expect(201);
        expect(ok.body.case.ucn.endsWith('-000001')).toBe(true);
      });
    });

    describe('file rules', () => {
      const expectNothingSaved = async () => {
        expect(await ctx.prisma.case.count()).toBe(0);
        expect(await ctx.prisma.caseDocument.count()).toBe(0);
        expect(await ctx.prisma.caseCounter.count()).toBe(0);
        expect(storedFiles()).toEqual([]);
        expect(await tempLeftovers()).toEqual([]);
      };

      it.each([
        ['a .txt file', 'notes.txt', Buffer.from('plain text')],
        ['an .exe file', 'setup.exe', Buffer.from('MZ\x90\x00')],
        ['a file with no extension', 'document', pdfBuffer()],
        ['a double extension', 'plea.pdf.exe', pdfBuffer()],
      ])('rejects %s', async (_n, name, content) => {
        const res = await submit(litigant, validCase(), [{ name, content }]).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FILE);
        await expectNothingSaved();
      });

      it('rejects an .exe or .txt renamed to .pdf (magic bytes are checked)', async () => {
        for (const content of [
          Buffer.from('MZ\x90\x00\x03 this is a Windows program'),
          Buffer.from('just text, not a pdf'),
        ]) {
          const res = await submit(litigant, validCase(), [
            { name: 'looks-legit.pdf', content },
          ]).expect(400);
          expect(res.body.message).toBe(Messages.INVALID_FILE);
        }
        await expectNothingSaved();
      });

      it('rejects a PDF whose signature is not at the very start', async () => {
        const res = await submit(litigant, validCase(), [
          { name: 'late.pdf', content: Buffer.concat([Buffer.from('junk'), pdfBuffer()]) },
        ]).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FILE);
      });

      it('rejects an empty file', async () => {
        await submit(litigant, validCase(), [
          { name: 'empty.pdf', content: Buffer.alloc(0) },
        ]).expect(400);
        await expectNothingSaved();
      });

      it('rejects a file over 25 MB, and accepts one just under it', async () => {
        const header = Buffer.from('%PDF-1.4\n');
        const tooBig = Buffer.concat([header, Buffer.alloc(25 * 1024 * 1024 + 1 - header.length)]);
        const res = await submit(litigant, validCase(), [
          { name: 'huge.pdf', content: tooBig },
        ]).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FILE);
        await expectNothingSaved();

        const justUnder = Buffer.concat([header, Buffer.alloc(25 * 1024 * 1024 - header.length)]);
        await submit(litigant, validCase(), [{ name: 'big.pdf', content: justUnder }]).expect(201);
      });

      it('saves nothing at all when only one of several files is invalid', async () => {
        const res = await submit(litigant, validCase(), [
          { name: 'one.pdf', content: pdfBuffer('1') },
          { name: 'two.pdf', content: pdfBuffer('2') },
          { name: 'fake.pdf', content: Buffer.from('not a pdf at all') },
        ]).expect(400);
        expect(res.body.message).toBe(Messages.INVALID_FILE);
        await expectNothingSaved();
      });

      it('saves nothing when a valid file is followed by a wrong extension', async () => {
        await submit(litigant, validCase(), [
          { name: 'one.pdf', content: pdfBuffer('1') },
          { name: 'two.txt', content: pdfBuffer('2') },
        ]).expect(400);
        await expectNothingSaved();
      });

      it('allows 10 files and rejects 11', async () => {
        const files = (n: number) =>
          Array.from({ length: n }, (_, i) => ({
            name: `f${i}.pdf`,
            content: pdfBuffer(String(i)),
          }));
        await submit(litigant, validCase(), files(10)).expect(201);
        const res = await submit(litigant, validCase(), files(11)).expect(400);
        expect(res.body.message).toBe(Messages.TOO_MANY_FILES);
        expect(await ctx.prisma.case.count()).toBe(1);
        expect(await tempLeftovers()).toEqual([]);
      });

      it('rolls everything back, files included, if the audit write fails inside the transaction', async () => {
        const spy = jest
          .spyOn(ctx.app.get(AuditService), 'logWithin')
          .mockRejectedValue(new Error('simulated audit failure'));
        try {
          const res = await submit(litigant, validCase(), [
            { name: 'a.pdf', content: pdfBuffer() },
          ]);
          expect(res.status).toBe(500);
        } finally {
          spy.mockRestore();
        }
        expect(await ctx.prisma.case.count()).toBe(0);
        expect(await ctx.prisma.caseDocument.count()).toBe(0);
        expect(await ctx.prisma.caseCounter.count()).toBe(0); // the UCN number is not consumed either
        expect(storedFiles()).toEqual([]);
        expect(await tempLeftovers()).toEqual([]);
      });
    });

    describe('access control', () => {
      it('requires authentication and writes no files for anonymous uploads', async () => {
        await request(server())
          .post('/api/cases')
          .field('data', JSON.stringify(validCase()))
          .attach('files', pdfBuffer(), 'a.pdf')
          .expect(401);
        expect(await tempLeftovers()).toEqual([]);
      });

      it.each([
        ['ADMIN', 'admin@example.test', '36302-5000001-1'],
        ['JUDGE', 'judge@example.test', '36302-5000002-2'],
        ['INTERN', 'intern@example.test', '36302-5000003-3'],
        ['PROCESS_SERVER', 'server@example.test', '36302-5000004-4'],
      ] as const)('forbids %s (403) from every case route', async (role, email, cnic) => {
        await createUser(ctx.prisma, {
          role,
          email,
          cnic,
          password: 'OtherPass1x',
          username: role === 'ADMIN' ? 'admin1' : undefined,
        });
        const agent = await login(email, 'OtherPass1x');
        await submit(agent, validCase(), [{ name: 'a.pdf', content: pdfBuffer() }]).expect(403);
        await agent.get('/api/cases').expect(403);
        await agent.get('/api/cases/summary').expect(403);
        expect(await ctx.prisma.case.count()).toBe(0);
        expect(await tempLeftovers()).toEqual([]);
      });

      it('requires authentication on the read routes', async () => {
        await request(server()).get('/api/cases').expect(401);
        await request(server()).get('/api/cases/summary').expect(401);
        await request(server()).get('/api/cases/00000000-0000-4000-8000-000000000000').expect(401);
      });
    });
  });

  describe('reading cases', () => {
    it('returns an empty portfolio when the user has no cases', async () => {
      const res = await litigant.get('/api/cases').expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
    });

    it("lists only the caller's own cases, newest first", async () => {
      const first = await submit(litigant, validCase({ title: 'First case' })).expect(201);
      await new Promise((r) => setTimeout(r, 15));
      const second = await submit(litigant, validCase({ title: 'Second case' })).expect(201);
      await submit(litigantB, validCase({ title: 'Bilal private case' })).expect(201);

      const mine = await litigant.get('/api/cases').expect(200);
      expect(mine.body.data.map((c: { id: string }) => c.id)).toEqual([
        second.body.case.id,
        first.body.case.id,
      ]);
      expect(mine.body.data[0]).toMatchObject({
        judge: null,
        courtroom: null,
        status: 'PENDING_ASSIGNMENT',
      });
      expect(JSON.stringify(mine.body)).not.toContain('Bilal private case');

      const theirs = await litigantB.get('/api/cases').expect(200);
      expect(theirs.body.meta.total).toBe(1);
    });

    it('searches by UCN or title, filters by status and paginates', async () => {
      const a = await submit(litigant, validCase({ title: 'Land dispute Multan' })).expect(201);
      await submit(
        litigant,
        validCase({ caseType: 'BAIL_APPLICATION', title: 'Bail for Imran' }),
      ).expect(201);
      await submit(litigant, validCase({ title: 'Another civil matter' })).expect(201);
      await ctx.prisma.case.update({
        where: { id: a.body.case.id },
        data: { status: 'HEARING_FIXED' },
      });

      const byTitle = await litigant.get('/api/cases?search=land dispute').expect(200);
      expect(byTitle.body.data.map((c: { title: string }) => c.title)).toEqual([
        'Land dispute Multan',
      ]);

      const byUcn = await litigant
        .get(`/api/cases?search=${encodeURIComponent(a.body.case.ucn.slice(0, -2))}`)
        .expect(200);
      expect(byUcn.body.meta.total).toBeGreaterThanOrEqual(1);
      const exact = await litigant.get(`/api/cases?search=${a.body.case.ucn}`).expect(200);
      expect(exact.body.data).toHaveLength(1);
      expect(exact.body.data[0].ucn).toBe(a.body.case.ucn);

      const bail = await litigant.get('/api/cases?search=BAL').expect(200);
      expect(bail.body.data).toHaveLength(1);

      const byStatus = await litigant.get('/api/cases?status=HEARING_FIXED').expect(200);
      expect(byStatus.body.data).toHaveLength(1);
      expect(
        (await litigant.get('/api/cases?status=PENDING_ASSIGNMENT').expect(200)).body.meta.total,
      ).toBe(2);
      await litigant.get('/api/cases?status=NOT_A_STATUS').expect(400);

      const page1 = await litigant.get('/api/cases?limit=2&page=1').expect(200);
      const page2 = await litigant.get('/api/cases?limit=2&page=2').expect(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page2.body.data).toHaveLength(1);
      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      await litigant.get('/api/cases?limit=500').expect(400);
    });

    it('shows a lawyer the cases where they are counsel, even if someone else filed them', async () => {
      const filed = await submit(litigant, validCase({ title: 'Filed by litigant' })).expect(201);
      expect((await lawyer.get('/api/cases').expect(200)).body.meta.total).toBe(0);
      await lawyer.get(`/api/cases/${filed.body.case.id}`).expect(404);

      const profile = await ctx.prisma.lawyerProfile.findFirstOrThrow({
        where: { user: { email: 'lawyer@example.test' } },
      });
      await ctx.prisma.caseParty.updateMany({
        where: { caseId: filed.body.case.id, role: 'PETITIONER' },
        data: { lawyerId: profile.id },
      });

      expect((await lawyer.get('/api/cases').expect(200)).body.meta.total).toBe(1);
      await lawyer.get(`/api/cases/${filed.body.case.id}`).expect(200);
    });

    it('returns full details with parties, documents and chronological events', async () => {
      const created = await submit(litigant, validCase(), [
        { name: 'one.pdf', content: pdfBuffer('1') },
        { name: 'two.pdf', content: pdfBuffer('2') },
      ]).expect(201);
      const res = await litigant.get(`/api/cases/${created.body.case.id}`).expect(200);

      expect(res.body).toMatchObject({
        ucn: created.body.case.ucn,
        status: 'PENDING_ASSIGNMENT',
        judge: null,
        court: null,
        courtroom: null,
        filedBy: 'Ayesha Siddiqui',
      });
      expect(res.body.parties).toHaveLength(2);
      expect(res.body.documents.map((d: { name: string }) => d.name)).toEqual([
        'one.pdf',
        'two.pdf',
      ]);
      expect(JSON.stringify(res.body)).not.toContain('filePath');
      const types = res.body.events.map((e: { type: string }) => e.type);
      expect(types).toEqual(['CASE_SUBMITTED', 'DOCUMENT_ATTACHED', 'DOCUMENT_ATTACHED']);
      const times = res.body.events.map((e: { createdAt: string }) =>
        new Date(e.createdAt).getTime(),
      );
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it("returns 404 (not 403) for another user's case, and for unknown or malformed ids", async () => {
      const mine = await submit(litigant, validCase(), [
        { name: 'a.pdf', content: pdfBuffer() },
      ]).expect(201);
      const id = mine.body.case.id as string;
      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId: id } });

      for (const path of [`/api/cases/${id}`, `/api/cases/${id}/documents/${doc.id}/download`]) {
        const res = await litigantB.get(path).expect(404);
        expect(res.body.message).toBe(Messages.NOT_FOUND);
      }
      await litigantB
        .post(`/api/cases/${id}/documents`)
        .attach('files', pdfBuffer('x'), 'x.pdf')
        .expect(404);
      await litigant.get('/api/cases/00000000-0000-4000-8000-000000000000').expect(404);
      await litigant.get('/api/cases/not-a-uuid').expect(404);
      // And the owner can still read it.
      await litigant.get(`/api/cases/${id}`).expect(200);
      expect(await ctx.prisma.caseDocument.count({ where: { caseId: id } })).toBe(1);
    });

    it('gives the dashboard summary', async () => {
      expect((await litigant.get('/api/cases/summary').expect(200)).body).toEqual({
        total: 0,
        pendingAssignment: 0,
        recent: [],
      });
      for (let i = 0; i < 7; i++)
        await submit(litigant, validCase({ title: `Case ${i}` })).expect(201);
      const first = await ctx.prisma.case.findFirstOrThrow({ where: { title: 'Case 0' } });
      await ctx.prisma.case.update({ where: { id: first.id }, data: { status: 'ALLOCATED' } });
      const res = await litigant.get('/api/cases/summary').expect(200);
      expect(res.body.total).toBe(7);
      expect(res.body.pendingAssignment).toBe(6);
      expect(res.body.recent).toHaveLength(5);
    });
  });

  describe('documents', () => {
    it('attaches more PDFs to an active case, with an event and an audit entry', async () => {
      const created = await submit(litigant, validCase()).expect(201);
      const id = created.body.case.id as string;
      const content = pdfBuffer('extra');
      const res = await litigant
        .post(`/api/cases/${id}/documents`)
        .attach('files', content, 'Extra statement.pdf')
        .expect(201);
      expect(res.body.message).toBe(Messages.DOCUMENT_ATTACHED);
      expect(res.body.attached).toBe(1);

      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId: id } });
      expect(doc.sha256).toBe(sha256(content));
      expect(
        await ctx.prisma.caseEvent.count({ where: { caseId: id, type: 'DOCUMENT_ATTACHED' } }),
      ).toBe(1);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: 'CASE_DOCUMENT_ATTACHED', entityId: id },
        }),
      ).toBe(1);
      expect(await tempLeftovers()).toEqual([]);
    });

    it('rejects invalid files and an empty request without saving anything', async () => {
      const created = await submit(litigant, validCase()).expect(201);
      const id = created.body.case.id as string;
      const bad = await litigant
        .post(`/api/cases/${id}/documents`)
        .attach('files', pdfBuffer('ok'), 'ok.pdf')
        .attach('files', Buffer.from('MZ not pdf'), 'fake.pdf')
        .expect(400);
      expect(bad.body.message).toBe(Messages.INVALID_FILE);
      const none = await litigant.post(`/api/cases/${id}/documents`).expect(400);
      expect(none.body.message).toBe(Messages.MISSING_FILE);
      expect(await ctx.prisma.caseDocument.count()).toBe(0);
      expect(storedFiles()).toEqual([]);
      expect(await tempLeftovers()).toEqual([]);
    });

    it('refuses new documents on a closed case', async () => {
      const created = await submit(litigant, validCase()).expect(201);
      await ctx.prisma.case.update({
        where: { id: created.body.case.id },
        data: { status: 'DECIDED' },
      });
      const res = await litigant
        .post(`/api/cases/${created.body.case.id}/documents`)
        .attach('files', pdfBuffer(), 'late.pdf')
        .expect(409);
      expect(res.body.message).toBe(Messages.CASE_CLOSED);
    });

    it('lets the lawyer on the case attach documents', async () => {
      const created = await submit(lawyer, validCase()).expect(201);
      await lawyer
        .post(`/api/cases/${created.body.case.id}/documents`)
        .attach('files', pdfBuffer(), 'a.pdf')
        .expect(201);
    });

    it('streams the original bytes with an attachment header; the SHA-256 matches the upload', async () => {
      const content = pdfBuffer('download me');
      const created = await submit(litigant, validCase(), [
        { name: 'My Petition (final).pdf', content },
      ]).expect(201);
      const id = created.body.case.id as string;
      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId: id } });

      const res = await litigant
        .get(`/api/cases/${id}/documents/${doc.id}/download`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
      expect(res.headers['content-disposition']).toContain('My Petition (final).pdf');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(sha256(res.body as Buffer)).toBe(sha256(content));
      expect(sha256(res.body as Buffer)).toBe(doc.sha256);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: 'CASE_DOCUMENT_DOWNLOADED', entityId: doc.id },
        }),
      ).toBe(1);
    });

    it('has no update or delete routes: documents are locked once attached', async () => {
      const created = await submit(litigant, validCase(), [
        { name: 'a.pdf', content: pdfBuffer() },
      ]).expect(201);
      const id = created.body.case.id as string;
      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId: id } });
      for (const path of [
        `/api/cases/${id}/documents/${doc.id}`,
        `/api/cases/${id}/documents`,
        `/api/cases/${id}/documents/${doc.id}/download`,
      ]) {
        await litigant.delete(path).expect(404);
        await litigant.patch(path).send({ name: 'x' }).expect(404);
        await litigant.put(path).send({ name: 'x' }).expect(404);
      }
      expect(await ctx.prisma.caseDocument.count({ where: { caseId: id } })).toBe(1);
      expect(storedFiles()).toHaveLength(1);
    });
  });
});
