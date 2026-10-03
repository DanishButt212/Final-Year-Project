/**
 * Development seed. Safe to re-run:
 *  - reference data (courts, fees, settings) and users are upserted;
 *  - sample cases are only created when the database has none;
 *  - dev passwords are regenerated on every run and written to docs/DEV_ACCOUNTS.md (git-ignored).
 * All names and CNICs are fictional (CNICs use the 36302-9xxxxxx-x range on purpose).
 */
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { CaseType, PartyRole, PrismaClient, Role } from '../src/generated/prisma/client';

config({ quiet: true });

const url = new URL(process.env.DATABASE_URL ?? '');
const schema = url.searchParams.get('schema') ?? undefined;
url.searchParams.delete('schema');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined),
});

const DOMAIN = 'digitaladaalat.test';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 14 chars, always containing upper, lower and a digit (matches the app's password policy). */
function generatePassword(): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ'),
    pick('abcdefghjkmnpqrstuvwxyz'),
    pick('23456789'),
    ...Array.from({ length: 11 }, () => pick(ALPHABET)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface SeedUser {
  key: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
  court?: 'SESSIONS' | 'LHC';
  /** shown in DEV_ACCOUNTS.md */
  dev?: boolean;
  lawyer?: { barNumber: string; status: 'VERIFIED' | 'PENDING' };
}

const USERS: SeedUser[] = [
  {
    key: 'admin',
    role: 'ADMIN',
    firstName: 'Tariq',
    lastName: 'Mehmood',
    email: `admin@${DOMAIN}`,
    username: 'admin',
    dev: true,
  },
  {
    key: 'judge',
    role: 'JUDGE',
    firstName: 'Imran',
    lastName: 'Qureshi',
    email: `judge@${DOMAIN}`,
    court: 'SESSIONS',
    dev: true,
  },
  {
    key: 'judge2',
    role: 'JUDGE',
    firstName: 'Saba',
    lastName: 'Hashmi',
    email: `judge2@${DOMAIN}`,
    court: 'SESSIONS',
  },
  {
    key: 'judge3',
    role: 'JUDGE',
    firstName: 'Khalid',
    lastName: 'Anwar',
    email: `judge3@${DOMAIN}`,
    court: 'LHC',
  },
  {
    key: 'lawyer',
    role: 'LAWYER',
    firstName: 'Hamza',
    lastName: 'Bukhari',
    email: `lawyer@${DOMAIN}`,
    dev: true,
    lawyer: { barNumber: 'MBA-2016-0101', status: 'VERIFIED' },
  },
  {
    key: 'lawyer2',
    role: 'LAWYER',
    firstName: 'Nadia',
    lastName: 'Gillani',
    email: `lawyer2@${DOMAIN}`,
    lawyer: { barNumber: 'MBA-2018-0202', status: 'VERIFIED' },
  },
  {
    key: 'lawyer3',
    role: 'LAWYER',
    firstName: 'Faisal',
    lastName: 'Kharal',
    email: `lawyer.pending@${DOMAIN}`,
    lawyer: { barNumber: 'MBA-2025-0303', status: 'PENDING' },
  },
  {
    key: 'intern',
    role: 'INTERN',
    firstName: 'Areeba',
    lastName: 'Khan',
    email: `intern@${DOMAIN}`,
    dev: true,
  },
  {
    key: 'server',
    role: 'PROCESS_SERVER',
    firstName: 'Rashid',
    lastName: 'Mehmood',
    email: `server@${DOMAIN}`,
    dev: true,
  },
  {
    key: 'litigant',
    role: 'LITIGANT',
    firstName: 'Muhammad',
    lastName: 'Ali',
    email: `litigant@${DOMAIN}`,
    dev: true,
  },
  {
    key: 'litigant2',
    role: 'LITIGANT',
    firstName: 'Sana',
    lastName: 'Noreen',
    email: `litigant2@${DOMAIN}`,
  },
];

const utcDate = (offsetDays: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays));
};

async function seedReference() {
  const sessions = await prisma.court.upsert({
    where: { name: 'District & Sessions Court Multan' },
    update: {},
    create: { name: 'District & Sessions Court Multan', type: 'DISTRICT_SESSIONS', city: 'Multan' },
  });
  const lhc = await prisma.court.upsert({
    where: { name: 'Lahore High Court Multan Bench' },
    update: {},
    create: { name: 'Lahore High Court Multan Bench', type: 'HIGH_COURT', city: 'Multan' },
  });

  const rooms: [string, string, number | null][] = [
    [sessions.id, 'Court Room 1', null],
    [sessions.id, 'Court Room 2', null],
    [sessions.id, 'Court Room 3', null],
    [lhc.id, 'Bench I', 1],
    [lhc.id, 'Bench II', 2],
  ];
  const courtrooms: Record<string, string> = {};
  for (const [courtId, name, benchNo] of rooms) {
    const room = await prisma.courtroom.upsert({
      where: { courtId_name: { courtId, name } },
      update: {},
      create: { courtId, name, benchNo, capacity: 40 },
    });
    courtrooms[name] = room.id;
  }

  const fees: [CaseType, string, string][] = [
    ['CIVIL_SUIT', 'Court fee for a civil suit (filing)', '2500.00'],
    ['CRIMINAL_APPEAL', 'Court fee for a criminal appeal (filing)', '1000.00'],
    ['WRIT_PETITION', 'Court fee for a writ petition (filing)', '500.00'],
    ['BAIL_APPLICATION', 'Court fee for a bail application (filing)', '300.00'],
  ];
  for (const [caseType, description, amount] of fees) {
    await prisma.feeStructure.upsert({
      where: { caseType_effectiveFrom: { caseType, effectiveFrom: new Date('2026-01-01') } },
      update: { amount, description },
      create: { caseType, description, amount, effectiveFrom: new Date('2026-01-01') },
    });
  }

  const settings: [string, string, string][] = [
    ['geofence_radius_meters', '200', 'Allowed distance from the chamber for intern attendance'],
    ['geofence_chamber_lat', '30.1978', 'Demo chamber latitude (Multan)'],
    ['geofence_chamber_lng', '71.4697', 'Demo chamber longitude (Multan)'],
    ['max_pleading_size_mb', '25', 'Maximum PDF pleading size'],
    ['hearing_slots_per_day', '8', 'Number of hearing time slots per judge per day'],
  ];
  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, description },
    });
  }
  return { sessions, lhc, courtrooms };
}

async function seedUsers(courts: { sessions: { id: string }; lhc: { id: string } }) {
  const credentials: { user: SeedUser; password: string }[] = [];
  const ids: Record<string, string> = {};
  const lawyerProfileIds: Record<string, string> = {};

  for (const [index, u] of USERS.entries()) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const cnic = `36302-${String(9000001 + index)}-${index % 10}`;
    const phone = `+92 300 ${String(1000001 + index)}`;
    const courtId =
      u.court === 'SESSIONS' ? courts.sessions.id : u.court === 'LHC' ? courts.lhc.id : undefined;

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, status: 'ACTIVE' },
      create: {
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        username: u.username,
        cnic,
        phone,
        passwordHash,
        courtId,
        notificationPreference: { create: {} },
      },
    });
    ids[u.key] = user.id;

    if (u.lawyer) {
      const profile = await prisma.lawyerProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          barNumber: u.lawyer.barNumber,
          verificationStatus: u.lawyer.status,
          ...(u.lawyer.status === 'VERIFIED'
            ? { verifiedAt: new Date(), verifiedById: ids.admin }
            : {}),
        },
      });
      lawyerProfileIds[u.key] = profile.id;
    }
    credentials.push({ user: u, password });
  }

  await prisma.internProfile.upsert({
    where: { userId: ids.intern },
    update: {},
    create: {
      userId: ids.intern,
      supervisorId: lawyerProfileIds.lawyer,
      startDate: new Date('2026-07-01'),
    },
  });
  return { ids, lawyerProfileIds, credentials };
}

async function seedSampleData(
  ids: Record<string, string>,
  lawyers: Record<string, string>,
  courts: { sessions: { id: string }; lhc: { id: string }; courtrooms: Record<string, string> },
) {
  if ((await prisma.case.count()) > 0) {
    console.log('Sample cases already exist, skipping sample data.');
    return;
  }

  const cases = [
    {
      n: 1,
      type: 'BAIL_APPLICATION',
      title: 'Muhammad Ali vs. The State',
      relief: 'Post-arrest bail in FIR No. 214/2026, Police Station Cantt, Multan.',
      filer: 'litigant',
      judge: 'judge',
      status: 'HEARING_FIXED',
      court: courts.sessions.id,
      parties: [
        ['PETITIONER', 'Muhammad Ali', 'lawyer'],
        ['RESPONDENT', 'The State', null],
      ],
    },
    {
      n: 2,
      type: 'CIVIL_SUIT',
      title: 'Sana Noreen vs. Bilal Ahmed',
      relief: 'Recovery of PKR 1,850,000 against an unpaid sale agreement.',
      filer: 'litigant2',
      judge: 'judge2',
      status: 'PENDING',
      court: courts.sessions.id,
      parties: [
        ['PETITIONER', 'Sana Noreen', 'lawyer2'],
        ['RESPONDENT', 'Bilal Ahmed', null],
      ],
    },
    {
      n: 3,
      type: 'WRIT_PETITION',
      title: 'Zubair Traders vs. Federation of Pakistan',
      relief: 'Declaration that the impugned notice dated 12-08-2026 is without lawful authority.',
      filer: 'lawyer',
      judge: 'judge3',
      status: 'ALLOCATED',
      court: courts.lhc.id,
      parties: [
        ['PETITIONER', 'Zubair Traders', 'lawyer'],
        ['RESPONDENT', 'Federation of Pakistan', null],
      ],
    },
    {
      n: 4,
      type: 'CRIMINAL_APPEAL',
      title: 'Ghulam Abbas vs. The State',
      relief: 'Appeal against the judgment dated 30-06-2026 in Sessions Case No. 88/2025.',
      filer: 'lawyer2',
      judge: 'judge3',
      status: 'DECIDED',
      court: courts.lhc.id,
      parties: [
        ['APPELLANT', 'Ghulam Abbas', 'lawyer2'],
        ['RESPONDENT', 'The State', null],
      ],
    },
    {
      n: 5,
      type: 'CIVIL_SUIT',
      title: 'Rukhsana Bibi vs. Ahsan Raza',
      relief:
        'Permanent injunction restraining interference in possession of House No. 14-B, Gulgasht Colony, Multan.',
      filer: 'litigant',
      judge: null,
      status: 'FILED',
      court: courts.sessions.id,
      parties: [
        ['PETITIONER', 'Rukhsana Bibi', null],
        ['RESPONDENT', 'Ahsan Raza', null],
      ],
    },
  ] as const;

  const created: Record<number, string> = {};
  for (const c of cases) {
    const record = await prisma.case.create({
      data: {
        ucn: `DA-2026-MUL-${String(c.n).padStart(6, '0')}`,
        caseType: c.type as CaseType,
        status: c.status,
        title: c.title,
        reliefSought: c.relief,
        filingDate: utcDate(-30 + c.n),
        filedById: ids[c.filer],
        courtId: c.court,
        judgeId: c.judge ? ids[c.judge] : null,
        allocatedAt: c.judge ? utcDate(-20 + c.n) : null,
        parties: {
          create: c.parties.map(([role, name, lawyerKey]) => ({
            role: role as PartyRole,
            name,
            lawyerId: lawyerKey ? lawyers[lawyerKey] : null,
          })),
        },
      },
    });
    created[c.n] = record.id;
  }

  // Two upcoming hearings; the unique (judge, date, slot) constraint prevents judge double-booking.
  await prisma.hearing.create({
    data: {
      caseId: created[1],
      judgeId: ids.judge,
      courtroomId: courts.courtrooms['Court Room 1'],
      date: utcDate(3),
      timeSlot: 1,
      startTime: '09:00',
      purpose: 'Arguments on bail',
    },
  });
  await prisma.hearing.create({
    data: {
      caseId: created[2],
      judgeId: ids.judge2,
      courtroomId: courts.courtrooms['Court Room 2'],
      date: utcDate(5),
      timeSlot: 2,
      startTime: '09:30',
      purpose: 'Written statement',
    },
  });

  // A paid challan with receipt.
  const challan = await prisma.challan.create({
    data: {
      challanNo: 'CH-2026-000001',
      caseId: created[1],
      payerId: ids.litigant,
      amount: '300.00',
      status: 'PAID',
      dueDate: utcDate(-25),
    },
  });
  await prisma.payment.create({
    data: {
      challanId: challan.id,
      payerId: ids.litigant,
      amount: '300.00',
      method: 'MOCK_CARD',
      status: 'SUCCESS',
      gatewayRef: 'MOCK-TXN-000001',
      receiptNo: 'RC-2026-000001',
      paidAt: utcDate(-25),
    },
  });

  // Summons waiting for the process server.
  const party = await prisma.caseParty.findFirstOrThrow({
    where: { caseId: created[2], role: 'RESPONDENT' },
  });
  await prisma.summons.create({
    data: {
      caseId: created[2],
      partyId: party.id,
      serverId: ids.server,
      status: 'ASSIGNED',
      dueBy: utcDate(2),
    },
  });

  // Chamber data for the main lawyer.
  const client = await prisma.chamberClient.create({
    data: {
      lawyerId: lawyers.lawyer,
      name: 'Muhammad Ali',
      phone: '+92 300 1000010',
      email: 'litigant@digitaladaalat.test',
    },
  });
  const entry = await prisma.billableEntry.create({
    data: {
      lawyerId: lawyers.lawyer,
      clientId: client.id,
      caseId: created[1],
      workedOn: utcDate(-4),
      hours: '2.50',
      hourlyRate: '5000.00',
      description: 'Drafting bail application',
    },
  });
  await prisma.retainerTransaction.createMany({
    data: [
      { clientId: client.id, type: 'DEPOSIT', amount: '50000.00', note: 'Initial retainer' },
      {
        clientId: client.id,
        type: 'DEDUCTION',
        amount: '12500.00',
        billableEntryId: entry.id,
        note: 'Fees for 2.5 hours',
      },
    ],
  });
  await prisma.chamberExpense.create({
    data: {
      lawyerId: lawyers.lawyer,
      clientId: client.id,
      category: 'Photocopying and stamp papers',
      amount: '1850.00',
      spentOn: utcDate(-3),
    },
  });

  // Intern diary and a geo-fenced attendance record.
  const intern = await prisma.internProfile.findUniqueOrThrow({ where: { userId: ids.intern } });
  await prisma.internDiaryEntry.create({
    data: {
      internId: intern.id,
      entryDate: utcDate(-1),
      content: 'Attended Court Room 1, observed bail arguments, prepared index of case file.',
    },
  });
  await prisma.attendance.create({
    data: {
      internId: intern.id,
      date: utcDate(-1),
      checkInAt: new Date(),
      lat: '30.197800',
      lng: '71.469700',
      distanceMeters: 35,
      withinGeofence: true,
    },
  });

  await prisma.feedback.create({
    data: {
      userId: ids.litigant,
      rating: 5,
      category: 'Usability',
      message: 'Filing was clear and quick.',
    },
  });
}

function writeAccountsFile(credentials: { user: SeedUser; password: string }[]) {
  const rows = credentials
    .map(
      ({ user, password }) =>
        `| ${user.role} | ${user.username ? `${user.username} or ` : ''}${user.email} | \`${password}\` | ${user.firstName} ${user.lastName}${user.dev ? '' : ' (sample)'} |`,
    )
    .join('\n');
  const text = `# Development accounts

> LOCAL DEVELOPMENT ONLY. This file is git-ignored. Never reuse these passwords anywhere else.
> Regenerated by every \`npm run prisma:seed\` (passwords change on each run).
> Generated: ${new Date().toISOString()}

| Role | Log in with | Password | Name |
|---|---|---|---|
${rows}

Admins log in with their username or email; everyone else with email.
The lawyer "Faisal Kharal" is intentionally PENDING verification.
`;
  const file = resolve(__dirname, '../../docs/DEV_ACCOUNTS.md');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  return file;
}

async function main() {
  const reference = await seedReference();
  const { ids, lawyerProfileIds, credentials } = await seedUsers(reference);
  await seedSampleData(ids, lawyerProfileIds, reference);
  const file = writeAccountsFile(credentials);

  console.log(
    '\nSeed complete. Development accounts (shown once; also saved to docs/DEV_ACCOUNTS.md):',
  );
  for (const { user, password } of credentials.filter((c) => c.user.dev)) {
    console.log(
      `  ${user.role.padEnd(15)} ${(user.username ?? user.email).padEnd(34)} ${password}`,
    );
  }
  console.log(`\nAll ${credentials.length} accounts written to ${file}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
