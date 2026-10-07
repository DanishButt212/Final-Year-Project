/** QA: slots, anti-clash, cancel/reschedule, auto-generate, cause lists, parallel booking, TZ independence. */
import { pkAt, pkIsoDate, pkMinutesNow } from '../src/common/pk-time';
import { buildSlots, slotHasPassed } from '../src/scheduling/slots';
import { allocateDirect, Api, buildWorld, fileCase, login, workingDay, World } from './fixtures';
import { createTestApp, resetDatabase, TestContext } from './helpers';

describe('QA scheduling and cause lists (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let lawyer: Api;
  let litigant: Api;
  const day = workingDay(2);
  const saturday = (() => {
    const d = new Date(`${day}T00:00:00Z`);
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    admin = await login(ctx, w.emails.admin);
    lawyer = await login(ctx, w.emails.lawyer);
    litigant = await login(ctx, w.emails.litigant);
  });
  afterAll(() => ctx.app.close());

  /** A case filed by `who` and allocated straight to a judge/courtroom. */
  const allocated = async (who: Api, judgeId = w.ids.judge, room = w.rooms.r1) => {
    const { case: c } = await fileCase(who, { caseType: 'WRIT_PETITION' });
    await allocateDirect(ctx.prisma, c.id, w, judgeId, room);
    return c.id;
  };
  const book = (caseId: string, slot: number, courtroomId = w.rooms.r1, date = day, judgeId?: string) =>
    admin.post('/api/admin/hearings').send({ caseId, courtroomId, date, slot, ...(judgeId ? { judgeId } : {}) });

  it('exposes 10 slots of 30 minutes from 09:00 to 14:00', async () => {
    const board = await admin.get(`/api/admin/scheduling/board?courtId=${w.courtId}&date=${day}`).expect(200);
    expect(board.body.slots).toHaveLength(10);
    expect(board.body.slots[0]).toMatchObject({ slot: 1, start: '09:00', end: '09:30' });
    expect(board.body.slots[9]).toMatchObject({ slot: 10, start: '13:30', end: '14:00' });
  });

  it('refuses weekends, past days and slots outside court hours', async () => {
    const id = await allocated(litigant);
    expect((await book(id, 1, w.rooms.r1, saturday)).status).toBe(400);
    expect((await book(id, 1, w.rooms.r1, '2020-01-06')).status).toBe(400);
    expect((await book(id, 11)).status).toBe(400);
  });

  it('refuses a slot that has already started today (Pakistan time)', async () => {
    const today = pkIsoDate();
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const id = await allocated(litigant);
    const res = await book(id, 1, w.rooms.r1, today);
    if (dow === 0 || dow === 6) expect(res.status).toBe(400);
    else if (pkMinutesNow() >= 9 * 60) {
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Cannot schedule a hearing in a time slot that has already passed.');
    } else expect(res.status).toBe(201);
  });

  it('enforces judge, courtroom and lawyer anti-clash per slot but allows several hearings a day', async () => {
    const a = await allocated(lawyer);
    const b = await allocated(lawyer, w.ids.judge2, w.rooms.r2);
    const c = await allocated(litigant);
    await book(a, 3).expect(201);
    // Same judge, same slot, other courtroom.
    const judgeClash = await book(c, 3, w.rooms.r2);
    expect(judgeClash.status).toBe(409);
    expect(judgeClash.body.message).toBe('Scheduling Conflict: Judge has a matching hearing at the same time in Room 1.');
    // Same courtroom, other judge.
    const roomClash = await book(c, 3, w.rooms.r1, day, w.ids.judge2);
    expect(roomClash.status).toBe(409);
    expect(roomClash.body.message).toBe('Scheduling Conflict: Room 1 is already booked for this time slot.');
    // Same lawyer (counsel on a and b), different judge and room.
    const lawyerClash = await book(b, 3, w.rooms.r2);
    expect(lawyerClash.status).toBe(409);
    expect(lawyerClash.body.message).toBe('Scheduling Conflict: Lawyer has a matching court appearance time in Room 1.');
    // Several hearings in one day are fine.
    await book(b, 4, w.rooms.r2).expect(201);
    await book(c, 5).expect(201);
  });

  it('answers "Clear/Valid" from the check endpoint for a free slot', async () => {
    const id = await allocated(litigant);
    const res = await admin
      .post('/api/admin/scheduling/check')
      .send({ caseId: id, courtroomId: w.rooms.r1, date: day, slot: 8 })
      .expect(200);
    expect(res.body).toMatchObject({
      valid: true,
      label: 'Clear/Valid',
      message: 'Anti-clash verification successful: No schedule conflicts detected.',
    });
  });

  it('frees the slot when a hearing is cancelled', async () => {
    const x = await allocated(litigant);
    const y = await allocated(litigant);
    const h = await book(x, 6).expect(201);
    expect((await book(y, 6)).status).toBe(409);
    await admin.post(`/api/admin/hearings/${h.body.hearing.id}/cancel`).send({ reason: 'Bench on leave today.' }).expect(200);
    await book(y, 6).expect(201);
  });

  it('reschedules with the anti-clash check and reports a manual resolution', async () => {
    const x = await allocated(litigant);
    const h = await book(x, 7).expect(201);
    const clash = await admin.patch(`/api/admin/hearings/${h.body.hearing.id}/reschedule`).send({ date: day, slot: 3 });
    expect(clash.status).toBe(409); // slot 3 is taken by the judge
    const moved = await admin
      .patch(`/api/admin/hearings/${h.body.hearing.id}/reschedule`)
      .send({ date: day, slot: 9, resolveConflict: true })
      .expect(200);
    expect(moved.body.message).toBe('Schedule overlap resolved manually.');
    expect(moved.body.hearing.startTime).toBe('13:00');
  });

  it('lets only one of several parallel bookings of the same slot through', async () => {
    const ids = await Promise.all([0, 1, 2, 3].map(() => allocated(litigant)));
    const results = await Promise.all(ids.map((id) => book(id, 10)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('auto-generates hearings into free slots', async () => {
    const ids = await Promise.all([0, 1].map(() => allocated(litigant, w.ids.judge2, w.rooms.r2)));
    const d2 = workingDay(3);
    const res = await admin
      .post('/api/admin/scheduling/auto-generate')
      .send({ courtId: w.courtId, date: d2, caseIds: ids })
      .expect(201);
    expect(res.body.placed).toHaveLength(2);
    const slots = res.body.placed.map((h: { slot: number }) => h.slot);
    expect(new Set(slots).size).toBe(2);
  });

  it('shows "Roster details not yet published. Check back later." until the cause list is published', async () => {
    const before = await litigant.get(`/api/cause-lists?date=${day}`).expect(200);
    expect(before.body).toMatchObject({ published: false, message: 'Roster details not yet published. Check back later.' });
    await admin.post('/api/admin/cause-lists/publish').send({ courtId: w.courtId, date: day }).expect(200);
    const after = await litigant.get(`/api/cause-lists?date=${day}`).expect(200);
    expect(after.body.published).toBe(true);
    const mine = after.body.lists[0].entries.filter((e: { isMine: boolean }) => e.isMine);
    expect(mine.length).toBeGreaterThan(0);
    expect(after.body.lists[0].entries.map((e: { serialNo: number }) => e.serialNo)[0]).toBe(1);
  });

  describe('time zone independence', () => {
    const original = process.env.TZ;
    afterAll(() => {
      process.env.TZ = original;
    });

    it.each(['UTC', 'Asia/Karachi', 'America/New_York'])(
      'computes the same slot instants and "today" with TZ=%s',
      (tz) => {
        process.env.TZ = tz;
        const date = new Date('2026-10-08T00:00:00Z');
        expect(pkAt(date, '09:00').toISOString()).toBe('2026-10-08T04:00:00.000Z');
        expect(pkIsoDate(new Date('2026-10-07T20:30:00Z'))).toBe('2026-10-08');
        expect(pkMinutesNow(new Date('2026-10-07T20:30:00Z'))).toBe(90);
        const slots = buildSlots({ courtDayStart: '09:00', courtDayEnd: '14:00', hearingSlotMinutes: 30 });
        // 09:10 PKT on 08-10 -> slot 1 has started, slot 2 has not.
        const now = new Date('2026-10-08T04:10:00Z');
        expect(slotHasPassed(date, slots[0], now)).toBe(true);
        expect(slotHasPassed(date, slots[1], now)).toBe(false);
        // 23:30 UTC on 07-10 is already 08-10 in Pakistan.
        expect(slotHasPassed(date, slots[0], new Date('2026-10-07T23:30:00Z'))).toBe(false);
      },
    );

    it('gives the same board under TZ=UTC and TZ=Asia/Karachi', async () => {
      process.env.TZ = 'UTC';
      const a = (await admin.get(`/api/admin/scheduling/board?courtId=${w.courtId}&date=${day}`)).body;
      process.env.TZ = 'Asia/Karachi';
      const b = (await admin.get(`/api/admin/scheduling/board?courtId=${w.courtId}&date=${day}`)).body;
      expect(b.slots).toEqual(a.slots);
      expect(b.hearingCount).toBe(a.hearingCount);
    });
  });
});
