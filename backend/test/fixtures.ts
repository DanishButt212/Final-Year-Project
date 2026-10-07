/**
 * QA fixtures: a small "world" with every role, built directly in the test database, plus helpers to log in,
 * file cases and build test files. Passwords are a fixed test-only value and are never printed.
 */
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { deflateSync } from 'node:zlib';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureChamber } from '../src/chamber/ensure-chamber';
import { TestContext, validCase } from './helpers';

export const PASSWORD = 'Passw0rdTest';

export type Api = {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  put: (url: string) => request.Test;
  delete: (url: string) => request.Test;
  token: string;
};

/** Logs in through the API (Bearer token) and returns a request builder that sends it. */
export async function login(ctx: TestContext, identifier: string, password = PASSWORD): Promise<Api> {
  const res = await request(ctx.app.getHttpServer())
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({ identifier, password });
  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(`login failed for ${identifier}: ${res.status}`);
  }
  return bearer(ctx, res.body.accessToken as string);
}

export function bearer(ctx: TestContext, token: string): Api {
  const server = ctx.app.getHttpServer();
  const auth = (t: request.Test) => t.set('Authorization', `Bearer ${token}`);
  return {
    get: (u) => auth(request(server).get(u)),
    post: (u) => auth(request(server).post(u)),
    patch: (u) => auth(request(server).patch(u)),
    put: (u) => auth(request(server).put(u)),
    delete: (u) => auth(request(server).delete(u)),
    token,
  };
}

export const anon = (ctx: TestContext) => {
  const server = ctx.app.getHttpServer();
  return {
    get: (u: string) => request(server).get(u),
    post: (u: string) => request(server).post(u),
    patch: (u: string) => request(server).patch(u),
    put: (u: string) => request(server).put(u),
    delete: (u: string) => request(server).delete(u),
  };
};

let cnicSeq = 1000000;
const nextCnic = () => `36302-${String(cnicSeq++).padStart(7, '0')}-${cnicSeq % 10}`;

export interface World {
  courtId: string;
  court2Id: string;
  rooms: { r1: string; r2: string; b1: string };
  ids: Record<
    | 'admin'
    | 'judge'
    | 'judge2'
    | 'judgeOther'
    | 'litigant'
    | 'litigant2'
    | 'lawyer'
    | 'lawyer2'
    | 'lawyerPending'
    | 'intern'
    | 'server',
    string
  >;
  lawyerProfileId: string;
  lawyer2ProfileId: string;
  internProfileId: string;
  serverProfileId: string;
  chamberCode: string;
  emails: Record<string, string>;
}

async function user(
  prisma: PrismaService,
  role: Role,
  key: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.user.create({
    data: {
      role,
      firstName: key.charAt(0).toUpperCase() + key.slice(1),
      lastName: 'Tester',
      email: `${key}@qa.test`,
      username: role === 'ADMIN' ? `${key}user` : undefined,
      cnic: nextCnic(),
      phone: '+92 300 1234567',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      notificationPreference: { create: {} },
      ...extra,
    },
  });
}

/** Courts, courtrooms, fees, settings and one account per role (plus a few extras). */
export async function buildWorld(prisma: PrismaService): Promise<World> {
  const court = await prisma.court.create({
    data: {
      name: 'QA Sessions Court',
      type: 'DISTRICT_SESSIONS',
      city: 'Multan',
      latitude: '30.197800',
      longitude: '71.469700',
      geofenceRadiusM: 300,
    },
  });
  const court2 = await prisma.court.create({
    data: { name: 'QA High Court', type: 'HIGH_COURT', city: 'Multan' },
  });
  const r1 = await prisma.courtroom.create({ data: { courtId: court.id, name: 'Room 1' } });
  const r2 = await prisma.courtroom.create({ data: { courtId: court.id, name: 'Room 2' } });
  const b1 = await prisma.courtroom.create({ data: { courtId: court2.id, name: 'Bench I' } });
  const fees: [string, string][] = [
    ['CIVIL_SUIT', '2500.00'],
    ['CRIMINAL_APPEAL', '1000.00'],
    ['WRIT_PETITION', '500.00'],
    ['BAIL_APPLICATION', '300.00'],
  ];
  for (const [caseType, amount] of fees) {
    await prisma.feeStructure.create({
      data: {
        caseType: caseType as never,
        amount,
        description: `QA fee ${caseType}`,
        effectiveFrom: new Date('2026-01-01'),
      },
    });
  }

  const admin = await user(prisma, 'ADMIN', 'admin');
  const judge = await user(prisma, 'JUDGE', 'judge', { courtId: court.id, courtroomId: r1.id });
  const judge2 = await user(prisma, 'JUDGE', 'judgetwo', { courtId: court.id, courtroomId: r2.id });
  const judgeOther = await user(prisma, 'JUDGE', 'judgeother', {
    courtId: court2.id,
    courtroomId: b1.id,
  });
  const litigant = await user(prisma, 'LITIGANT', 'litigant');
  const litigant2 = await user(prisma, 'LITIGANT', 'litiganttwo');
  const lawyer = await user(prisma, 'LAWYER', 'lawyer');
  const lawyer2 = await user(prisma, 'LAWYER', 'lawyertwo');
  const lawyerPending = await user(prisma, 'LAWYER', 'lawyerpending');
  const lp = await prisma.lawyerProfile.create({
    data: {
      userId: lawyer.id,
      barNumber: 'LH-1001',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: admin.id,
    },
    include: { user: true },
  });
  const lp2 = await prisma.lawyerProfile.create({
    data: {
      userId: lawyer2.id,
      barNumber: 'LH-1002',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: admin.id,
    },
    include: { user: true },
  });
  await prisma.lawyerProfile.create({
    data: { userId: lawyerPending.id, barNumber: 'LH-2001', verificationStatus: 'PENDING' },
  });
  const chamber = await prisma.$transaction((tx) => ensureChamber(tx, lp));
  await prisma.$transaction((tx) => ensureChamber(tx, lp2));
  const intern = await user(prisma, 'INTERN', 'intern');
  const ip = await prisma.internProfile.create({
    data: { userId: intern.id, supervisorId: lp.id, startDate: new Date('2026-09-01') },
  });
  const server = await user(prisma, 'PROCESS_SERVER', 'server');
  const sp = await prisma.processServerProfile.create({
    data: { userId: server.id, badgeNumber: 'PS-QA-1', courtId: court.id, sector: 'Cantt' },
  });

  const ids = {
    admin: admin.id,
    judge: judge.id,
    judge2: judge2.id,
    judgeOther: judgeOther.id,
    litigant: litigant.id,
    litigant2: litigant2.id,
    lawyer: lawyer.id,
    lawyer2: lawyer2.id,
    lawyerPending: lawyerPending.id,
    intern: intern.id,
    server: server.id,
  };
  return {
    courtId: court.id,
    court2Id: court2.id,
    rooms: { r1: r1.id, r2: r2.id, b1: b1.id },
    ids,
    lawyerProfileId: lp.id,
    lawyer2ProfileId: lp2.id,
    internProfileId: ip.id,
    serverProfileId: sp.id,
    chamberCode: chamber.chamberCode,
    emails: {
      admin: 'admin@qa.test',
      judge: 'judge@qa.test',
      judge2: 'judgetwo@qa.test',
      judgeOther: 'judgeother@qa.test',
      litigant: 'litigant@qa.test',
      litigant2: 'litiganttwo@qa.test',
      lawyer: 'lawyer@qa.test',
      lawyer2: 'lawyertwo@qa.test',
      lawyerPending: 'lawyerpending@qa.test',
      intern: 'intern@qa.test',
      server: 'server@qa.test',
    },
  };
}

/** Files a case through the API (multipart) and returns the created case body. */
export async function fileCase(
  api: Api,
  overrides: Record<string, unknown> = {},
  files: { name: string; content: Buffer }[] = [],
) {
  let req = api.post('/api/cases').field('data', JSON.stringify(validCase(overrides)));
  for (const f of files) req = req.attach('files', f.content, f.name);
  const res = await req;
  if (res.status !== 201) throw new Error(`fileCase failed: ${res.status} ${res.body?.message}`);
  return res.body as { case: { id: string; ucn: string }; message: string };
}

/** Puts a case straight into the allocated state (no API), for flows that start after allocation. */
export async function allocateDirect(
  prisma: PrismaService,
  caseId: string,
  w: World,
  judgeId = w.ids.judge,
  courtroomId = w.rooms.r1,
) {
  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: 'ALLOCATED',
      courtId: w.courtId,
      courtroomId,
      judgeId,
      allocatedAt: new Date(),
    },
  });
}

// ------------------------------------------------------------------ file fixtures

/** A valid PDF of roughly `bytes` size (padding inside a PDF comment). */
export function pdfOfSize(bytes: number, label = 'qa'): Buffer {
  const head = Buffer.from(`%PDF-1.4\n% ${label}\n`);
  const tail = Buffer.from('\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const pad = Math.max(0, bytes - head.length - tail.length);
  return Buffer.concat([head, Buffer.alloc(pad, 0x20), tail]);
}

/** A Windows executable header renamed to .pdf (fails the magic-byte check). */
export const fakePdf = () => Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x41)]);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A real w×h RGB PNG. */
export function png(w = 32, h = 16): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A minimal JPEG (SOI + JFIF APP0 + EOI); enough for magic-byte checks. */
export const jpg = () =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0'),
    Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0]),
    Buffer.alloc(64, 0),
    Buffer.from([0xff, 0xd9]),
  ]);

/** The next working day (Mon-Fri) after today in Pakistan time, as YYYY-MM-DD. */
export function workingDay(offset = 1): string {
  const today = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())}T00:00:00Z`,
  );
  let d = today;
  let left = offset;
  while (left > 0) {
    d = new Date(d.getTime() + 86_400_000);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) left--;
  }
  return d.toISOString().slice(0, 10);
}
