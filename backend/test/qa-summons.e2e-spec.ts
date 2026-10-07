/** QA: summons issue/assign, GPS attempts, sealed finalize with photo + signature, tamper detection, privacy, cancel. */
import { allocateDirect, Api, buildWorld, fileCase, jpg, login, png, World } from './fixtures';
import { createTestApp, resetDatabase, TestContext } from './helpers';

const GPS = { latitude: 30.1978, longitude: 71.4697, accuracyM: 12 };

describe('QA summons and process server (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let server: Api;
  let litigant: Api;
  let litigant2: Api;
  let judge: Api;
  let caseId: string;
  let summonsId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
    server = await login(ctx, w.emails.server);
    litigant = await login(ctx, w.emails.litigant);
    litigant2 = await login(ctx, w.emails.litigant2);
    judge = await login(ctx, w.emails.judge);
    const { case: c } = await fileCase(litigant);
    caseId = c.id;
  });
  afterAll(() => ctx.app.close());

  const issue = (extra: Record<string, unknown> = {}) =>
    admin.post('/api/admin/summons').send({
      caseId,
      noticeType: 'SUMMONS',
      recipientName: 'Bilal Respondent',
      serviceAddress: 'House 7, Street 2, Gulgasht Colony, Multan',
      sector: 'Gulgasht',
      priority: 'URGENT',
      ...extra,
    });

  it('refuses to issue for a case without a judge, then issues and assigns', async () => {
    const early = await issue();
    expect(early.status).toBe(409);
    await allocateDirect(ctx.prisma, caseId, w);
    const res = await issue({ assignedServerId: w.ids.server }).expect(201);
    expect(res.body.message).toBe('Summons issued and assigned successfully.');
    summonsId = res.body.id;
    const roster = await server.get('/api/server/roster').expect(200);
    expect(roster.body.data.map((s: { id: string }) => s.id)).toContain(summonsId);
  });

  it('requires high-accuracy GPS for an attempt', async () => {
    const noGps = await server.post(`/api/server/summons/${summonsId}/attempts`).send({ notes: 'Door locked, neighbour informed.' });
    expect(noGps.status).toBe(422);
    expect(noGps.body.message).toBe('Telemetry Error: High-accuracy GPS coordinates required to commit log entries.');
    const vague = await server
      .post(`/api/server/summons/${summonsId}/attempts`)
      .send({ ...GPS, accuracyM: 5000, notes: 'Door locked, neighbour informed.' });
    expect(vague.status).toBe(422);
  });

  it('refuses to finalize before an attempt, then records an attempt', async () => {
    const early = await server
      .post(`/api/server/summons/${summonsId}/finalize`)
      .field('serviceMode', 'PERSONAL_DELIVERY')
      .field('latitude', String(GPS.latitude))
      .field('longitude', String(GPS.longitude))
      .field('accuracyM', String(GPS.accuracyM))
      .field('notes', 'Delivered by hand to the respondent.')
      .attach('photo', jpg(), 'photo.jpg')
      .attach('signature', png(), 'signature.png');
    expect(early.status).toBe(409);
    const res = await server
      .post(`/api/server/summons/${summonsId}/attempts`)
      .send({ ...GPS, notes: 'Door locked, neighbour informed.' })
      .expect(201);
    expect(res.body.message).toBe('Progress log entry committed.');
  });

  it('finalizes with photo and signature and seals the proof', async () => {
    const res = await server
      .post(`/api/server/summons/${summonsId}/finalize`)
      .field('serviceMode', 'PERSONAL_DELIVERY')
      .field('latitude', String(GPS.latitude))
      .field('longitude', String(GPS.longitude))
      .field('accuracyM', String(GPS.accuracyM))
      .field('notes', 'Delivered by hand to the respondent.')
      .attach('photo', png(64, 48), 'photo.png')
      .attach('signature', png(), 'signature.png');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Summons execution proof secured.');
    const s = await ctx.prisma.summons.findUniqueOrThrow({ where: { id: summonsId } });
    expect(s.status).toBe('EXECUTED');
    expect(s.seal).toMatch(/^[0-9a-f]{64}$/);
    const v = await admin.post(`/api/admin/summons/${summonsId}/verify-seal`).expect(200);
    expect(v.body.result).toBe('valid');
    await admin.get(`/api/admin/summons/${summonsId}/proof/photo`).expect(200);
  });

  it('reports a tampered proof', async () => {
    const before = await ctx.prisma.summons.findUniqueOrThrow({ where: { id: summonsId } });
    await ctx.prisma.summons.update({ where: { id: summonsId }, data: { executionNotes: 'Edited later by someone.' } as never });
    const v = await admin.post(`/api/admin/summons/${summonsId}/verify-seal`).expect(200);
    expect(v.body.result).toBe('tampered');
    expect(v.body.message).toBe('The seal does not match: the proof or its files were altered.');
    await ctx.prisma.summons.update({ where: { id: summonsId }, data: { executionNotes: (before as unknown as { executionNotes: string }).executionNotes } as never });
    expect((await admin.post(`/api/admin/summons/${summonsId}/verify-seal`)).body.result).toBe('valid');
  });

  it('shows filers the status but never the server identity or coordinates; others get 404', async () => {
    const res = await litigant.get(`/api/cases/${caseId}/summons`).expect(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain('EXECUTED');
    expect(text).not.toContain('Server Tester');
    expect(text).not.toContain('30.197800');
    expect(text).not.toContain('PS-QA-1');
    const staff = JSON.stringify((await judge.get(`/api/cases/${caseId}/summons`).expect(200)).body);
    expect(staff).toContain('30.197800');
    await litigant2.get(`/api/cases/${caseId}/summons`).expect(404);
    const pdf = await litigant.get(`/api/summons/${summonsId}/proof.pdf`).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    await litigant2.get(`/api/summons/${summonsId}/proof.pdf`).expect(404);
    await litigant.get(`/api/summons/${summonsId}/proof/photo`).expect(403);
  });

  it('cancels an open summons and refuses changes to a closed one', async () => {
    const res = await issue({ assignedServerId: w.ids.server }).expect(201);
    await admin.post(`/api/admin/summons/${res.body.id}/cancel`).send({ reason: 'Respondent appeared voluntarily.' }).expect(200);
    const attempt = await server.post(`/api/server/summons/${res.body.id}/attempts`).send({ ...GPS, notes: 'Trying after cancel.' });
    expect([404, 409]).toContain(attempt.status);
  });
});
