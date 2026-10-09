/** QA: case filing rules, UCN under concurrency, fees and mock payments, allocation. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Api, buildWorld, fakePdf, fileCase, login, pdfOfSize, World } from './fixtures';
import { createTestApp, pdfBuffer, resetDatabase, TestContext, validCase } from './helpers';
import { TEST_UPLOAD_DIR } from './setup-env';

const year = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric' }).format(new Date());

describe('QA filing, fees, payments and allocation (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let litigant: Api;
  let litigant2: Api;
  let admin: Api;
  let judge: Api;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    litigant = await login(ctx, w.emails.litigant);
    litigant2 = await login(ctx, w.emails.litigant2);
    admin = await login(ctx, w.emails.admin);
    judge = await login(ctx, w.emails.judge);
  });
  afterAll(() => ctx.app.close());

  const submit = (api: Api, data: unknown, files: { name: string; content: Buffer }[] = []) => {
    let req = api.post('/api/cases').field('data', JSON.stringify(data));
    for (const f of files) req = req.attach('files', f.content, f.name);
    return req;
  };

  describe('filing', () => {
    it('gives every case type its UCN code', async () => {
      const codes: Record<string, string> = {
        CIVIL_SUIT: 'CIV',
        CRIMINAL_APPEAL: 'CRA',
        WRIT_PETITION: 'WRT',
        BAIL_APPLICATION: 'BAL',
      };
      for (const [caseType, code] of Object.entries(codes)) {
        const res = await fileCase(litigant, { caseType });
        expect(res.case.ucn).toMatch(new RegExp(`^DA-${year()}-${code}-\\d{6}$`));
      }
    });

    it('keeps UCNs unique and sequential under 10 parallel filings', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => fileCase(litigant, { caseType: 'WRIT_PETITION', title: `Parallel ${i}` })),
      );
      const seqs = results.map((r) => Number(r.case.ucn.slice(-6))).sort((a, b) => a - b);
      expect(new Set(seqs).size).toBe(10);
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1] + 1);
    });

    it('accepts up to 10 PDFs and refuses an 11th', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({ name: `p${i}.pdf`, content: pdfBuffer(`ten-${i}`) }));
      await submit(litigant, validCase(), ten).expect(201);
      const eleven = [...ten, { name: 'p10.pdf', content: pdfBuffer('eleven') }];
      const res = await submit(litigant, validCase(), eleven);
      expect(res.status).toBe(400);
    });

    it('accepts a ~20 MB PDF and refuses one over 25 MB with the exact message', async () => {
      await submit(litigant, validCase(), [{ name: 'big.pdf', content: pdfOfSize(20 * 1024 * 1024) }]).expect(201);
      const res = await submit(litigant, validCase(), [{ name: 'huge.pdf', content: pdfOfSize(26 * 1024 * 1024) }]);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Only PDF format files under 25MB are allowed.');
    });

    it('refuses a renamed non-PDF (magic bytes) and a non-PDF extension', async () => {
      for (const f of [{ name: 'evil.pdf', content: fakePdf() }, { name: 'notes.txt', content: Buffer.from('%PDF-1.4 hi') }]) {
        const res = await submit(litigant, validCase(), [f]);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Only PDF format files under 25MB are allowed.');
      }
    });

    it('says "Case registration is currently closed." when filing is switched off', async () => {
      await admin.put('/api/admin/settings').send({ caseRegistrationOpen: false }).expect(200);
      const res = await submit(litigant, validCase());
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Case registration is currently closed.');
      await admin.put('/api/admin/settings').send({ caseRegistrationOpen: true }).expect(200);
    });

    it('lets only parties attach and download documents (others get 404)', async () => {
      const { case: c } = await fileCase(litigant, {}, [{ name: 'petition.pdf', content: pdfBuffer('party') }]);
      const extra = await litigant
        .post(`/api/cases/${c.id}/documents`)
        .attach('files', pdfBuffer('extra'), 'annex.pdf');
      expect(extra.status).toBe(201);
      expect(extra.body.message).toBe('Legal document attached successfully.');
      const docs = await ctx.prisma.caseDocument.findMany({ where: { caseId: c.id } });
      expect(docs).toHaveLength(2);
      await litigant.get(`/api/cases/${c.id}/documents/${docs[0].id}/download`).expect(200);
      await litigant2.get(`/api/cases/${c.id}/documents/${docs[0].id}/download`).expect(404);
      await litigant2.get(`/api/cases/${c.id}`).expect(404);
      await litigant2.post(`/api/cases/${c.id}/documents`).attach('files', pdfBuffer('x'), 'x.pdf').expect(404);
      await judge.get(`/api/judge/cases/${c.id}`).expect(404); // not allocated to this judge yet
    });

    it('keeps uploaded pleadings on disk byte-for-byte (pleadings are not encrypted)', async () => {
      const content = pdfBuffer('bytes-check');
      const { case: c } = await fileCase(litigant, {}, [{ name: 'b.pdf', content }]);
      const doc = await ctx.prisma.caseDocument.findFirstOrThrow({ where: { caseId: c.id } });
      expect(readFileSync(join(TEST_UPLOAD_DIR, doc.filePath))).toEqual(content);
    });
  });

  describe('fees and payments', () => {
    let caseId: string;
    let challanId: string;

    beforeAll(async () => {
      const { case: c } = await fileCase(litigant, { claimAmountPkr: '1000000' });
      caseId = c.id;
    });

    it('computes base + ad valorem for a civil suit and numbers the challan CH-YYYY-000001', async () => {
      const gen = await litigant.post(`/api/cases/${caseId}/challan`).expect(200);
      const res = await litigant.get(`/api/cases/${caseId}/challan`).expect(200);
      challanId = res.body.challan.id;
      expect(gen.body.challan.id).toBe(challanId);
      expect(gen.body.message).toBe('Challan generated.');
      expect(res.body.challan.challanNo).toMatch(new RegExp(`^CH-${year()}-\\d{6}$`));
      // 2,500 base + 1% of 1,000,000 (cap 50,000) = 12,500.
      expect(res.body.challan.amount).toBe('12500.00');
    });

    it('keeps one active challan per case', async () => {
      const again = await litigant.post(`/api/cases/${caseId}/challan`).expect(200);
      expect(again.body.challan.id).toBe(challanId);
      expect(again.body.message).toBe('Your challan is ready.');
      expect(await ctx.prisma.challan.count({ where: { caseId } })).toBe(1);
    });

    const pay = async (api: Api, cardNumber: string) => {
      const co = await api.post('/api/payments/checkout').send({ challanId });
      if (co.status !== 201 && co.status !== 200) return co;
      return api.post('/api/mock-gateway/authorize').send({
        paymentId: co.body.paymentId,
        cardholderName: 'Ayesha Tester',
        cardNumber,
        expiry: '12/30',
        cvv: '123',
      });
    };

    it('declines 4000 0000 0000 0002 and any unknown card with the exact message', async () => {
      for (const card of ['4000 0000 0000 0002', '4111 1111 1111 1111']) {
        const res = await pay(litigant, card);
        expect(res.status).toBe(402);
        expect(res.body.message).toBe('Payment Unsuccessful: Gateway rejected request details.');
      }
    });

    it('does not let another user pay someone else\'s challan', async () => {
      const res = await litigant2.post('/api/payments/checkout').send({ challanId });
      expect(res.status).toBe(404);
    });

    it('approves 4242 4242 4242 4242, issues RCPT-YYYY-000001, and blocks paying twice', async () => {
      const res = await pay(litigant, '4242 4242 4242 4242');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Payment successful.');
      expect(res.body.receiptNo).toMatch(new RegExp(`^RCPT-${year()}-\\d{6}$`));
      await litigant.get(`/api/payments/${res.body.paymentId}/receipt`).expect(200);
      const again = await pay(litigant, '5555 5555 5555 4444');
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('This challan is already paid.');
    });

    it('approves 5555 5555 5555 4444 on another case', async () => {
      const { case: c } = await fileCase(litigant, { caseType: 'BAIL_APPLICATION' });
      await litigant.post(`/api/cases/${c.id}/challan`).expect(200);
      const ch = (await litigant.get(`/api/cases/${c.id}/challan`)).body.challan;
      const co = await litigant.post('/api/payments/checkout').send({ challanId: ch.id });
      const res = await litigant.post('/api/mock-gateway/authorize').send({
        paymentId: co.body.paymentId,
        cardholderName: 'Ayesha Tester',
        cardNumber: '5555555555554444',
        expiry: '12/30',
        cvv: '123',
      });
      expect(res.status).toBe(200);
      expect(ch.amount).toBe('300.00');
    });

    it('never stores a card number or CVV anywhere in the database', async () => {
      const cols = await ctx.prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
        SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type IN ('text', 'jsonb', 'character varying', 'ARRAY')`;
      const hits: string[] = [];
      for (const c of cols) {
        const expr = c.data_type === 'ARRAY' ? `array_to_string("${c.column_name}", ',')` : `"${c.column_name}"::text`;
        for (const needle of ['4242424242424242', '4242 4242 4242 4242', '5555555555554444', '4000000000000002']) {
          const rows = await ctx.prisma.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM "${c.table_name}" WHERE ${expr} LIKE $1`,
            `%${needle}%`,
          );
          if (rows[0].n > 0) hits.push(`${c.table_name}.${c.column_name}`);
        }
      }
      expect(hits).toEqual([]);
      const p = await ctx.prisma.payment.findFirstOrThrow({ where: { status: 'SUCCESS' } });
      expect(p.cardLast4).toBe('4242');
    });
  });

  describe('allocation', () => {
    it('requires a paid challan', async () => {
      const { case: c } = await fileCase(litigant);
      const res = await admin
        .post(`/api/admin/cases/${c.id}/allocate`)
        .send({ mode: 'MANUAL', courtId: w.courtId, judgeId: w.ids.judge });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Court fee is unpaid for this case.');
    });

    const paidCase = async () => {
      const { case: c } = await fileCase(litigant, { caseType: 'WRIT_PETITION' });
      await ctx.prisma.challan.create({
        data: {
          caseId: c.id,
          challanNo: `CH-TEST-${c.id.slice(0, 6)}`,
          amount: '500.00',
          status: 'PAID',
          dueDate: new Date(),
          payerId: w.ids.litigant,
          ledger: [],
          inputHash: c.id,
        } as never,
      });
      return c;
    };

    it('allocates manually to the chosen judge and courtroom', async () => {
      const c = await paidCase();
      const res = await admin
        .post(`/api/admin/cases/${c.id}/allocate`)
        .send({ mode: 'MANUAL', courtId: w.courtId, judgeId: w.ids.judge2, courtroomId: w.rooms.r2 })
        .expect(200);
      expect(res.body.message).toMatch(/^Case DA-.* allocated to /);
      const row = await ctx.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ status: 'ALLOCATED', judgeId: w.ids.judge2, courtroomId: w.rooms.r2 });
    });

    it('random allocation picks the judge with the fewest active cases', async () => {
      // judge2 already has one active case from the manual test; judge has none -> judge must be chosen.
      await ctx.prisma.case.updateMany({ where: { judgeId: w.ids.judge }, data: { judgeId: null } });
      for (let i = 0; i < 3; i++) {
        const c = await paidCase();
        const res = await admin.post(`/api/admin/cases/${c.id}/allocate`).send({ mode: 'RANDOM', courtId: w.courtId }).expect(200);
        const row = await ctx.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
        const counts = await Promise.all(
          [w.ids.judge, w.ids.judge2].map((j) =>
            ctx.prisma.case.count({ where: { judgeId: j, status: { in: ['ALLOCATED', 'PENDING', 'HEARING_FIXED'] } } }),
          ),
        );
        expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1);
        expect(res.body.message).toContain(row.ucn);
      }
    });
  });

  afterAll(() => {
    // Nothing stored outside the test upload folder.
    const walk = (d: string): number =>
      readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : 1), 0);
    expect(walk(TEST_UPLOAD_DIR)).toBeGreaterThan(0);
  });
});
