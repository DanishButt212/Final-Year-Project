/**
 * UX Upgrade D: global search scoping. One user must never find another user's case, whatever they type.
 */
import { allocateDirect, anon, Api, buildWorld, fileCase, login, World } from './fixtures';
import { createTestApp, resetDatabase, TestContext } from './helpers';

const KEYS = ['caseType', 'id', 'parties', 'stage', 'status', 'title', 'ucn'];

describe('Global search (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let litigant: Api;
  let litigant2: Api;
  let lawyer: Api;
  let lawyer2: Api;
  let judge: Api;
  let judge2: Api;
  let admin: Api;
  let intern: Api;
  let server: Api;
  const ucn: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };

  const party = (name: string) => ({
    petitioners: [{ name, address: 'House 1, Multan' }],
    respondents: [{ name: 'Common Respondent Qx' }],
  });
  const find = async (api: Api, q: string) => {
    const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`).expect(200);
    return (res.body.cases as { ucn: string }[]).map((c) => c.ucn);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    [litigant, litigant2, lawyer, lawyer2, judge, judge2, admin, intern, server] =
      await Promise.all(
        [
          'litigant',
          'litigant2',
          'lawyer',
          'lawyer2',
          'judge',
          'judge2',
          'admin',
          'intern',
          'server',
        ].map((k) => login(ctx, w.emails[k])),
      );
    const a = await fileCase(litigant, party('Uniqueperson Alpha'));
    const b = await fileCase(litigant2, party('Uniqueperson Beta'));
    const c = await fileCase(lawyer, party('Uniqueperson Gamma'));
    ucn.a = a.case.ucn;
    ucn.b = b.case.ucn;
    ucn.c = c.case.ucn;
    await allocateDirect(ctx.prisma, a.case.id, w, w.ids.judge);
    await allocateDirect(ctx.prisma, b.case.id, w, w.ids.judge2, w.rooms.r2);
  });
  afterAll(() => ctx.app.close());

  it('litigants find only the cases they filed', async () => {
    expect(await find(litigant, 'Uniqueperson')).toEqual([ucn.a]);
    expect(await find(litigant2, 'Uniqueperson')).toEqual([ucn.b]);
    expect(await find(litigant, 'Common Respondent')).toEqual([ucn.a]);
  });

  it("never returns another user's case by its exact or partial UCN", async () => {
    expect(await find(litigant, ucn.b)).toEqual([]);
    expect(await find(litigant, ucn.b.toLowerCase())).toEqual([]);
    expect(await find(litigant2, ucn.a.slice(0, 12))).not.toContain(ucn.a);
    expect(await find(litigant, ucn.a.toLowerCase())).toEqual([ucn.a]);
  });

  it('lawyers find the cases they filed or appear in, nothing else', async () => {
    expect(await find(lawyer, 'Uniqueperson')).toEqual([ucn.c]);
    expect(await find(lawyer2, 'Uniqueperson')).toEqual([]);
  });

  it('judges find only the cases allocated to them', async () => {
    expect(await find(judge, 'Uniqueperson')).toEqual([ucn.a]);
    expect(await find(judge2, 'Uniqueperson')).toEqual([ucn.b]);
    expect(await find(judge, ucn.b)).toEqual([]);
  });

  it('administrators find every case', async () => {
    expect((await find(admin, 'Uniqueperson')).sort()).toEqual([ucn.a, ucn.b, ucn.c].sort());
  });

  it('interns and process servers get no case results', async () => {
    expect(await find(intern, 'Uniqueperson')).toEqual([]);
    expect(await find(server, ucn.a)).toEqual([]);
  });

  it('returns only the whitelisted fields and at most 8 results', async () => {
    for (let i = 0; i < 9; i++) await fileCase(litigant, party(`Bulkname Person ${i}`));
    const res = await litigant.get('/api/search?q=Bulkname').expect(200);
    expect(res.body.cases).toHaveLength(8);
    for (const c of res.body.cases) expect(Object.keys(c).sort()).toEqual(KEYS);
    expect(JSON.stringify(res.body)).not.toMatch(/cnic|phone|address|House 1/i);
  });

  it('validates the query and requires a session', async () => {
    const short = await litigant.get('/api/search?q=a').expect(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
    await litigant.get(`/api/search?q=${'x'.repeat(65)}`).expect(400);
    await anon(ctx).get('/api/search?q=Uniqueperson').expect(401);
  });
});
