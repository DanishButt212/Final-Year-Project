import { Api, buildWorld, login, workingDay } from './fixtures';
import { createTestApp, pdfBuffer, resetDatabase, TestContext, validCase } from './helpers';

describe('lawyer-only case filing', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await createTestApp(); await resetDatabase(ctx.prisma); });
  afterAll(async () => ctx?.app.close());

  it('records lawyer as filer and lets the represented litigant follow the case', async () => {
    const world = await buildWorld(ctx.prisma);
    const party = await ctx.prisma.user.findUniqueOrThrow({ where: { id: world.ids.litigant } });
    const [lawyer, litigant, unrelated, reader] = await Promise.all([
      login(ctx, world.emails.lawyer), login(ctx, world.emails.litigant),
      login(ctx, world.emails.litigant2), login(ctx, world.emails.admin),
    ]);
    const payload = validCase({
      claimAmountPkr: 500_000,
      petitioners: [{ name: `${party.firstName} ${party.lastName}`, cnic: party.cnic }],
    });
    const submit = (actor: Api) => actor.post('/api/cases').field('data', JSON.stringify(payload))
      .attach('files', pdfBuffer('lawyer-filed pleading'), 'pleading.pdf');
    await submit(litigant).expect(403);
    expect(await ctx.prisma.case.count()).toBe(0);

    const { case: filed, challan } = (await submit(lawyer).expect(201)).body;
    expect(challan).toMatchObject({
      caseId: filed.id,
      status: 'UNPAID',
      amount: '2500.00',
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const fee = await litigant.get(`/api/cases/${filed.id}/challan`).expect(200);
    expect(fee.body.challan).toEqual(challan);
    await litigant.post(`/api/cases/${filed.id}/challan`).expect(200);
    expect((await litigant.get(`/api/cases/${filed.id}/challan`)).body.challan).toEqual(challan);
    await unrelated.get(`/api/challans/${challan.id}/pdf`).expect(404);
    const record = await ctx.prisma.case.findUniqueOrThrow({
      where: { id: filed.id }, include: { parties: true, documents: true },
    });
    expect(record.filedById).toBe(world.ids.lawyer);
    expect(record.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'PETITIONER', cnic: party.cnic, lawyerId: world.lawyerProfileId }),
    ]));
    expect((await litigant.get('/api/cases').expect(200)).body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: filed.id })]),
    );
    await litigant.get(`/api/cases/${filed.id}`).expect(200);
    await unrelated.get(`/api/cases/${filed.id}`).expect(404);
    await litigant.get(`/api/cases/${filed.id}/documents/${record.documents[0].id}/download`).expect(200);
    await litigant.post(`/api/cases/${filed.id}/documents`)
      .attach('files', pdfBuffer('prohibited filing'), 'extra.pdf').expect(403);

    await ctx.prisma.case.update({ where: { id: filed.id }, data: {
      status: 'ALLOCATED', judgeId: world.ids.judge, courtId: world.courtId, courtroomId: world.rooms.r1,
    } });
    const h = (await reader.post('/api/admin/hearings').send({
      caseId: filed.id, courtroomId: world.rooms.r1, date: workingDay(2), slot: 1,
    }).expect(201)).body.hearing;
    expect((await litigant.get('/api/hearings/mine?when=upcoming').expect(200)).body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: h.id })]),
    );
    expect(await ctx.prisma.notification.count({
      where: { userId: world.ids.litigant, type: 'HEARING_SCHEDULED' },
    })).toBeGreaterThan(0);
  });
});
