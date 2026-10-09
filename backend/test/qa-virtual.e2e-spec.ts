/** QA: virtual courtroom lifecycle, lobby lock, join window, party-only access, events, moderation, end. */
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { pkMinutesNow, pkToday } from '../src/common/pk-time';
import { MockMailerService } from '../src/integrations/mock-mailer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { VIDEO_PROVIDER, type VideoProvider } from '../src/virtual-courtroom/video-provider';
import { allocateDirect, Api, buildWorld, fileCase, login, World } from './fixtures';
import { mailer, resetDatabase, TestContext } from './helpers';

/** Stands in for JaaS so moderation commands are enabled; no external service is called. */
const fakeJaas: VideoProvider = {
  kind: 'JAAS',
  moderationEnabled: true,
  credentials: (roomName, user) => ({
    provider: 'JAAS',
    domain: '8x8.vc',
    roomName: `vpaas-test/${roomName}`,
    scriptUrl: 'https://8x8.vc/vpaas-test/external_api.js',
    jwt: `fake.${user.moderator ? 'moderator' : 'guest'}.token`,
  }),
};

describe('QA virtual courtroom (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let admin: Api;
  let litigant: Api;
  let litigant2: Api;
  let lawyer: Api;
  let judge: Api;
  let caseId: string;
  let hearingId: string;
  let sessionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockMailerService)
      .useValue(mailer)
      .overrideProvider(VIDEO_PROVIDER)
      .useValue(fakeJaas)
      .compile();
    const app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    ctx = { app, prisma: app.get(PrismaService) };
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    // A court day covering the whole day, so a slot "now" always exists.
    for (const [key, value] of [
      ['court_day_start', '00:00'],
      ['court_day_end', '23:30'],
      ['hearing_slot_minutes', '30'],
    ]) {
      await ctx.prisma.systemSetting.create({ data: { key, value } });
    }
    admin = await login(ctx, w.emails.admin);
    litigant = await login(ctx, w.emails.litigant);
    litigant2 = await login(ctx, w.emails.litigant2);
    lawyer = await login(ctx, w.emails.lawyer);
    judge = await login(ctx, w.emails.judge);
    caseId = (await fileCase(lawyer)).case.id; // filed by the lawyer: lawyer is counsel
    await ctx.prisma.case.update({ where: { id: caseId }, data: { filedById: w.ids.litigant } });
    await allocateDirect(ctx.prisma, caseId, w);
  });
  afterAll(() => ctx.app.close());

  const nowSlot = () => Math.min(Math.floor(pkMinutesNow() / 30) + 1, 47);
  const hearing = (slot: number, isVirtual = true, dayOffset = 0) =>
    ctx.prisma.hearing.create({
      data: {
        caseId,
        judgeId: w.ids.judge,
        courtroomId: w.rooms.r1,
        date: new Date(pkToday().getTime() + dayOffset * 86_400_000),
        timeSlot: slot,
        isVirtual,
        type: isVirtual ? 'VIRTUAL' : 'PHYSICAL',
      },
    });

  it('gives 404 for a hearing that is not virtual, and initialize refuses it', async () => {
    const h = await hearing(nowSlot(), false, -1);
    await litigant.get(`/api/hearings/${h.id}/virtual-session/status`).expect(404);
    const res = await admin.post(`/api/admin/hearings/${h.id}/virtual-session/initialize`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This hearing is not flagged as a virtual hearing.');
  });

  it('shows the lobby-locked message before the Admin Bench initializes the session', async () => {
    hearingId = (await hearing(nowSlot())).id;
    const res = await litigant.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(200);
    expect(res.body).toMatchObject({ state: 'LOCKED', message: 'Court Session Lobby is currently locked by the Admin Bench.' });
    const join = await litigant.post(`/api/hearings/${hearingId}/virtual-session/join`);
    expect(join.status).toBe(409);
    expect(join.body.message).toBe('Court Session Lobby is currently locked by the Admin Bench.');
  });

  it('lets only the case parties, the judge and admins see the room (others 404)', async () => {
    await litigant2.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(404);
    const other = await login(ctx, w.emails.judgeOther);
    await other.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(404);
    await lawyer.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(200);
    await judge.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(200);
  });

  it('initializes the session, notifies the parties and opens the room', async () => {
    const res = await admin.post(`/api/admin/hearings/${hearingId}/virtual-session/initialize`).expect(201);
    sessionId = res.body.sessionId;
    const again = await admin.post(`/api/admin/hearings/${hearingId}/virtual-session/initialize`);
    expect(again.status).toBe(409);
    const n = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: w.ids.litigant, type: 'HEARING_VIRTUAL_SESSION_OPENED' } });
    expect(n.body.startsWith('The virtual courtroom for your hearing is open.')).toBe(true);
    const st = await litigant.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(200);
    expect(st.body.state).toBe('OPEN');
    const s = await ctx.prisma.courtSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.roomName).toMatch(/^[a-z2-9]{24}$/);
  });

  it('hands out signed credentials; only the judge and admins are moderators', async () => {
    const j = await litigant.post(`/api/hearings/${hearingId}/virtual-session/join`).expect(200);
    expect(j.body).toMatchObject({ provider: 'JAAS', isModerator: false, sessionId });
    expect(j.body.jwt).toBe('fake.guest.token');
    expect((await judge.post(`/api/hearings/${hearingId}/virtual-session/join`).expect(200)).body.isModerator).toBe(true);
    await lawyer.post(`/api/hearings/${hearingId}/virtual-session/join`).expect(200);
    await litigant2.post(`/api/hearings/${hearingId}/virtual-session/join`).expect(404);
  });

  it('tracks join, mute and heartbeat events in the attendee list', async () => {
    await litigant.post(`/api/sessions/${sessionId}/events`).send({ type: 'JOINED', providerParticipantId: 'abc123' }).expect(200);
    await litigant.post(`/api/sessions/${sessionId}/events`).send({ type: 'AUDIO_MUTED' }).expect(200);
    await litigant.post(`/api/sessions/${sessionId}/events`).send({ type: 'BOGUS' }).expect(400);
    await litigant2.post(`/api/sessions/${sessionId}/events`).send({ type: 'JOINED' }).expect(404);
    const d = await admin.get(`/api/admin/virtual-sessions/${sessionId}`).expect(200);
    const me = d.body.attendees.find((a: { role: string }) => a.role === 'LITIGANT');
    expect(me).toMatchObject({ status: 'MUTED', live: true, providerParticipantId: 'abc123' });
  });

  it('applies mute, video-off, eject and readmit with confirmation tags', async () => {
    const d = await admin.get(`/api/admin/virtual-sessions/${sessionId}`).expect(200);
    const lawyerRow = d.body.attendees.find((a: { role: string }) => a.role === 'LAWYER');
    const judgeRow = d.body.attendees.find((a: { role: string }) => a.role === 'JUDGE');
    const cmd = (participantId: string, command: string) =>
      admin.post(`/api/admin/virtual-sessions/${sessionId}/command`).send({ participantId, command });
    expect((await cmd(lawyerRow.id, 'MUTE_AUDIO').expect(200)).body.participant).toMatchObject({ status: 'MUTED', confirmation: 'Audio muted' });
    expect((await cmd(lawyerRow.id, 'DISABLE_VIDEO').expect(200)).body.participant.confirmation).toBe('Video disabled');
    expect((await cmd(lawyerRow.id, 'EJECT').expect(200)).body.participant.status).toBe('EJECTED');
    const blocked = await lawyer.post(`/api/hearings/${hearingId}/virtual-session/join`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('You were moved to the court lobby by the Admin Bench. Please wait to be readmitted.');
    expect((await cmd(lawyerRow.id, 'READMIT').expect(200)).body.participant.confirmation).toBe('Readmitted');
    await lawyer.post(`/api/hearings/${hearingId}/virtual-session/join`).expect(200);
    const prot = await cmd(judgeRow.id, 'EJECT');
    expect(prot.status).toBe(409);
    expect(prot.body.message).toBe('Commands cannot target the presiding judge or the Admin Bench.');
    await cmd(lawyerRow.id, 'NUKE').expect(400);
  });

  it('enforces the window: NOT_YET before 15 minutes ahead, CLOSED after 60 minutes past the slot', async () => {
    const later = await hearing(nowSlot(), true, 2);
    const s1 = await litigant.get(`/api/hearings/${later.id}/virtual-session/status`).expect(200);
    expect(s1.body.state).toBe('NOT_YET');
    expect(s1.body.message).toMatch(/^The video room opens at \d{2}:\d{2} on \d{2}-\d{2}-\d{4}, 15 minutes before the hearing\.$/);
    const past = await hearing(nowSlot(), true, -2);
    const s2 = await litigant.get(`/api/hearings/${past.id}/virtual-session/status`).expect(200);
    expect(s2.body.state).toBe('CLOSED');
    const init = await admin.post(`/api/admin/hearings/${later.id}/virtual-session/initialize`);
    expect(init.status).toBe(409);
    expect(init.body.message).toBe('A virtual courtroom session can only be initialized on the day of the hearing.');
  });

  it('ends the session; the room closes for everyone', async () => {
    await admin.post(`/api/admin/virtual-sessions/${sessionId}/end`).expect(200);
    expect((await admin.post(`/api/admin/virtual-sessions/${sessionId}/end`)).status).toBe(409);
    const me = await litigant.get(`/api/sessions/${sessionId}/me`).expect(200);
    expect(me.body).toMatchObject({ sessionStatus: 'ENDED', message: 'This virtual hearing session has ended.' });
    const st = await litigant.get(`/api/hearings/${hearingId}/virtual-session/status`).expect(200);
    expect(st.body.state).toBe('CLOSED');
    const events = await ctx.prisma.caseEvent.findMany({ where: { caseId, type: { in: ['SESSION_INITIALIZED', 'SESSION_ENDED'] } } });
    expect(events).toHaveLength(2);
    const audits = await ctx.prisma.auditLog.count({ where: { action: { startsWith: 'VIRTUAL_SESSION_' } } });
    expect(audits).toBeGreaterThanOrEqual(5);
  });
});
