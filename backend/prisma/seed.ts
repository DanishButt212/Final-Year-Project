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
import { generateUcn } from '../src/cases/ucn';

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
  courtroom?: string;
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
    courtroom: 'Court Room 1',
    dev: true,
  },
  {
    key: 'judge2',
    role: 'JUDGE',
    firstName: 'Saba',
    lastName: 'Hashmi',
    email: `judge2@${DOMAIN}`,
    court: 'SESSIONS',
    courtroom: 'Court Room 2',
  },
  {
    key: 'judge3',
    role: 'JUDGE',
    firstName: 'Khalid',
    lastName: 'Anwar',
    email: `judge3@${DOMAIN}`,
    court: 'LHC',
    courtroom: 'Bench I',
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
    lawyer: { barNumber: 'LH-45821', status: 'PENDING' },
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
  // Added in Phase 3A (appended so the CNICs of earlier accounts do not change).
  {
    key: 'judge4',
    role: 'JUDGE',
    firstName: 'Nasir',
    lastName: 'Bajwa',
    email: `judge4@${DOMAIN}`,
    court: 'SESSIONS',
    courtroom: 'Court Room 3',
  },
  {
    key: 'judge5',
    role: 'JUDGE',
    firstName: 'Farah',
    lastName: 'Naeem',
    email: `judge5@${DOMAIN}`,
    court: 'LHC',
    courtroom: 'Bench II',
  },
  {
    key: 'judge6',
    role: 'JUDGE',
    firstName: 'Tahir',
    lastName: 'Mirza',
    email: `judge6@${DOMAIN}`,
    court: 'LHC',
    courtroom: 'Bench III',
  },
  {
    key: 'lawyer4',
    role: 'LAWYER',
    firstName: 'Omar',
    lastName: 'Cheema',
    email: `lawyer.revoked@${DOMAIN}`,
    lawyer: { barNumber: 'LH-99999', status: 'PENDING' },
  },
  {
    key: 'lawyer5',
    role: 'LAWYER',
    firstName: 'Maryam',
    lastName: 'Shah',
    email: `lawyer3@${DOMAIN}`,
    lawyer: { barNumber: 'LH-31207', status: 'VERIFIED' },
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
    [lhc.id, 'Bench III', 3],
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
    ['max_attachment_mb', '25', 'Maximum PDF attachment size in MB'],
    ['filing_fee_rate_modifier', '0', 'Filing fee rate modifier (percent)'],
    ['hearing_slots_per_day', '8', 'Number of hearing time slots per judge per day'],
    [
      'case_registration_open',
      'true',
      'Set to false to close new case registration (UC-2.1 precondition)',
    ],
  ];
  // Retired in Phase 3B: replaced by max_attachment_mb.
  await prisma.systemSetting.deleteMany({ where: { key: 'max_pleading_size_mb' } });
  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {}, // never overwrite a value an administrator has changed
      create: { key, value, description },
    });
  }
  return { sessions, lhc, courtrooms };
}

async function seedUsers(courts: {
  sessions: { id: string };
  lhc: { id: string };
  courtrooms: Record<string, string>;
}) {
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

    const courtroomId = u.courtroom ? courts.courtrooms[u.courtroom] : undefined;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, status: 'ACTIVE', courtroomId },
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
        courtroomId,
        notificationPreference: { create: {} },
      },
    });
    ids[u.key] = user.id;

    if (u.lawyer) {
      const existing = await prisma.lawyerProfile.findUnique({ where: { userId: user.id } });
      // A still-pending demo lawyer gets the bar number the mock Bar Council is meant to find (or reject).
      if (existing && existing.verificationStatus === 'PENDING' && u.lawyer.status === 'PENDING') {
        await prisma.lawyerProfile.update({
          where: { id: existing.id },
          data: { barNumber: u.lawyer.barNumber },
        });
      }
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
      status: 'PENDING_ASSIGNMENT',
      court: courts.sessions.id,
      parties: [
        ['PETITIONER', 'Rukhsana Bibi', null],
        ['RESPONDENT', 'Ahsan Raza', null],
      ],
    },
  ] as const;

  const created: Record<number, string> = {};
  for (const c of cases) {
    const filingDate = utcDate(-30 + c.n);
    const record = await prisma.$transaction(async (tx) => {
      const ucn = await generateUcn(tx, c.type as CaseType, filingDate.getUTCFullYear());
      return tx.case.create({
        data: {
          ucn,
          caseType: c.type as CaseType,
          status: c.status,
          title: c.title,
          reliefSought: c.relief,
          filingDate,
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
          events: {
            create: [
              {
                type: 'CASE_SUBMITTED' as const,
                description: `Case submitted as ${ucn} and pending assignment to a judge.`,
                actorId: ids[c.filer],
                createdAt: filingDate,
              },
            ],
          },
        },
      });
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

/** Phase 3A demo data: cases waiting for allocation and one allocated case. Re-runnable (matched by title). */
async function seedAllocationSamples(
  ids: Record<string, string>,
  lawyers: Record<string, string>,
  courts: { sessions: { id: string }; courtrooms: Record<string, string> },
) {
  await prisma.case.updateMany({
    where: { status: 'DECIDED', decidedAt: null },
    data: { decidedAt: utcDate(-3) },
  });

  const samples = [
    [
      'CIVIL_SUIT',
      'Hina Pervaiz vs. City Development Authority',
      'Declaration and cancellation of the allotment order dated 02-09-2026.',
      'litigant2',
      null,
      -1,
    ],
    [
      'BAIL_APPLICATION',
      'Waqas Ahmed vs. The State',
      'Pre-arrest bail in FIR No. 391/2026, Police Station Gulgasht, Multan.',
      'lawyer',
      'lawyer',
      -2,
    ],
    [
      'WRIT_PETITION',
      'Multan Traders Association vs. Provincial Government',
      'Writ against the arbitrary levy notified on 20-09-2026.',
      'lawyer2',
      'lawyer2',
      -4,
    ],
    [
      'CRIMINAL_APPEAL',
      'Shahid Mehmood vs. The State',
      'Appeal against conviction recorded on 15-09-2026 in Sessions Case No. 140/2026.',
      'litigant',
      null,
      -6,
    ],
    [
      'CIVIL_SUIT',
      'Ayesha Siddiqui vs. Kamran Siddiqui',
      'Recovery of dower amount of PKR 500,000 and maintenance allowance.',
      'lawyer5',
      'lawyer5',
      -9,
    ],
  ] as const;
  for (const [type, title, relief, filer, counsel, offset] of samples) {
    if (await prisma.case.findFirst({ where: { title } })) continue;
    const filingDate = utcDate(offset);
    await prisma.$transaction(async (tx) => {
      const ucn = await generateUcn(tx, type as CaseType, filingDate.getUTCFullYear());
      await tx.case.create({
        data: {
          ucn,
          caseType: type as CaseType,
          status: 'PENDING_ASSIGNMENT',
          title,
          reliefSought: relief,
          filingDate,
          filedById: ids[filer],
          parties: {
            create: [
              {
                role: type === 'CRIMINAL_APPEAL' ? 'APPELLANT' : 'PETITIONER',
                name: title.split(' vs. ')[0],
                lawyerId: counsel ? lawyers[counsel] : null,
              },
              { role: 'RESPONDENT', name: title.split(' vs. ')[1] },
            ],
          },
          events: {
            create: [
              {
                type: 'CASE_SUBMITTED',
                description: `Case submitted as ${ucn} and pending assignment to a judge.`,
                actorId: ids[filer],
                createdAt: filingDate,
              },
            ],
          },
        },
      });
    });
  }

  const allocatedTitle = 'Bashir Hussain vs. Multan Electric Supply Company';
  if (!(await prisma.case.findFirst({ where: { title: allocatedTitle } }))) {
    const filingDate = utcDate(-12);
    await prisma.$transaction(async (tx) => {
      const ucn = await generateUcn(tx, 'CIVIL_SUIT', filingDate.getUTCFullYear());
      await tx.case.create({
        data: {
          ucn,
          caseType: 'CIVIL_SUIT',
          status: 'ALLOCATED',
          title: allocatedTitle,
          reliefSought: 'Declaration that the detection bill of PKR 640,000 is illegal and void.',
          filingDate,
          filedById: ids.litigant,
          courtId: courts.sessions.id,
          courtroomId: courts.courtrooms['Court Room 2'],
          judgeId: ids.judge2,
          allocatedAt: utcDate(-10),
          parties: {
            create: [
              { role: 'PETITIONER', name: 'Bashir Hussain' },
              { role: 'RESPONDENT', name: 'Multan Electric Supply Company' },
            ],
          },
          events: {
            create: [
              {
                type: 'CASE_SUBMITTED',
                description: `Case submitted as ${ucn} and pending assignment to a judge.`,
                actorId: ids.litigant,
                createdAt: filingDate,
              },
              {
                type: 'CASE_ALLOCATED',
                description:
                  'Case allocated to Saba Hashmi, District & Sessions Court Multan, Court Room 2.',
                actorId: ids.admin,
                createdAt: utcDate(-10),
              },
            ],
          },
        },
      });
      await tx.notification.create({
        data: {
          userId: ids.litigant,
          type: 'CASE_ALLOCATED',
          title: 'Your case has been allocated',
          body: `${ucn} was allocated to Saba Hashmi at District & Sessions Court Multan, Court Room 2.`,
          sentAt: utcDate(-10),
        },
      });
    });
  }
}

/** The n-th working day (Monday to Friday) strictly after today. */
function workingDayAfterToday(n: number): Date {
  let d = utcDate(0);
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + 86_400_000);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) left--;
  }
  return d;
}

/** Phase 3B demo data: schedule policies, hearings on working days, one deliberate lawyer clash and cause lists. */
async function seedScheduling(
  ids: Record<string, string>,
  lawyers: Record<string, string>,
  courts: {
    sessions: { id: string };
    lhc: { id: string };
    courtrooms: Record<string, string>;
  },
) {
  const policy: [string, string, string][] = [
    ['court_day_start', '09:00', 'Court day start (HH:mm)'],
    ['court_day_end', '14:00', 'Court day end (HH:mm)'],
    ['hearing_slot_minutes', '30', 'Hearing slot length in minutes'],
  ];
  for (const [key, value, description] of policy) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  const MARKER = 'Phase 3B demo';
  if (await prisma.hearing.findFirst({ where: { purpose: { startsWith: MARKER } } })) {
    console.log('Scheduling demo data already exists, skipping.');
    return;
  }

  const slotTime = (slot: number) => {
    const m = 9 * 60 + (slot - 1) * 30;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const courtOf = (key: 'sessions' | 'lhc') =>
    key === 'sessions' ? courts.sessions.id : courts.lhc.id;

  // Extra allocated cases so every judge has something to schedule.
  const extra = [
    [
      'c1',
      'CIVIL_SUIT',
      'Imtiaz Ahmed vs. Punjab Revenue Authority',
      'litigant',
      'lawyer',
      'sessions',
      'judge',
      'Court Room 1',
    ],
    [
      'c2',
      'BAIL_APPLICATION',
      'Adeel Raza vs. The State',
      'lawyer2',
      'lawyer2',
      'sessions',
      'judge2',
      'Court Room 2',
    ],
    [
      'c3',
      'CIVIL_SUIT',
      'Nazia Parveen vs. Haseeb Ullah',
      'lawyer5',
      'lawyer5',
      'sessions',
      'judge4',
      'Court Room 3',
    ],
    [
      'c4',
      'BAIL_APPLICATION',
      'Salman Khan vs. The State',
      'lawyer2',
      'lawyer2',
      'sessions',
      'judge',
      'Court Room 1',
    ],
    [
      'c5',
      'WRIT_PETITION',
      'Al-Noor Mills vs. Federation of Pakistan',
      'lawyer5',
      'lawyer5',
      'lhc',
      'judge3',
      'Bench I',
    ],
    [
      'c6',
      'WRIT_PETITION',
      'Sheikh Textiles vs. Provincial Government',
      'lawyer',
      'lawyer',
      'lhc',
      'judge5',
      'Bench II',
    ],
    [
      'c7',
      'CRIMINAL_APPEAL',
      'Rafiq Ahmed vs. The State',
      'litigant',
      null,
      'lhc',
      'judge6',
      'Bench III',
    ],
    [
      'c8',
      'CIVIL_SUIT',
      'Mehwish Tariq vs. Danish Enterprises',
      'litigant2',
      null,
      'sessions',
      'judge2',
      'Court Room 2',
    ],
    [
      'cx',
      'BAIL_APPLICATION',
      'Hamid Nawaz vs. The State',
      'lawyer2',
      'lawyer2',
      'sessions',
      'judge4',
      'Court Room 3',
    ],
  ] as const;
  const caseIds: Record<string, string> = {};
  for (const [key, type, title, filer, counsel, court, judge, room] of extra) {
    const found = await prisma.case.findFirst({ where: { title } });
    if (found) {
      caseIds[key] = found.id;
      continue;
    }
    const filingDate = utcDate(-8);
    const row = await prisma.$transaction(async (tx) => {
      const ucn = await generateUcn(tx, type as CaseType, filingDate.getUTCFullYear());
      return tx.case.create({
        data: {
          ucn,
          caseType: type as CaseType,
          status: 'ALLOCATED',
          title,
          reliefSought: 'Relief as set out in the petition filed before this court (demo case).',
          filingDate,
          filedById: ids[filer],
          courtId: courtOf(court),
          courtroomId: courts.courtrooms[room],
          judgeId: ids[judge],
          allocatedAt: utcDate(-6),
          parties: {
            create: [
              {
                role: type === 'CRIMINAL_APPEAL' ? 'APPELLANT' : 'PETITIONER',
                name: title.split(' vs. ')[0],
                lawyerId: counsel ? lawyers[counsel] : null,
              },
              { role: 'RESPONDENT', name: title.split(' vs. ')[1] },
            ],
          },
          events: {
            create: [
              {
                type: 'CASE_SUBMITTED',
                description: `Case submitted as ${ucn} and pending assignment to a judge.`,
                actorId: ids[filer],
                createdAt: filingDate,
              },
              {
                type: 'CASE_ALLOCATED',
                description: `Case allocated to ${title.split(' vs. ')[0]}'s bench (demo).`,
                actorId: ids.admin,
                createdAt: utcDate(-6),
              },
            ],
          },
        },
      });
    });
    caseIds[key] = row.id;
  }
  const byTitle = async (title: string) =>
    (await prisma.case.findFirstOrThrow({ where: { title } })).id;
  caseIds.n1 = await byTitle('Muhammad Ali vs. The State');
  caseIds.n2 = await byTitle('Sana Noreen vs. Bilal Ahmed');
  caseIds.n3 = await byTitle('Zubair Traders vs. Federation of Pakistan');
  caseIds.bashir = await byTitle('Bashir Hussain vs. Multan Electric Supply Company');
  await prisma.case.update({
    where: { id: caseIds.n3 },
    data: { courtroomId: courts.courtrooms['Bench I'] },
  });

  // The two Phase 1 sample hearings fell on arbitrary days: remove them, they are re-created below.
  await prisma.hearing.deleteMany({ where: { caseId: { in: [caseIds.n1, caseIds.n2] } } });

  // [case, judge, room, working day after today, slot]
  const plan = [
    ['n1', 'judge', 'Court Room 1', 1, 1],
    ['n2', 'judge2', 'Court Room 2', 1, 2],
    ['c3', 'judge4', 'Court Room 3', 1, 1],
    ['c5', 'judge3', 'Bench I', 1, 2],
    ['c1', 'judge', 'Court Room 1', 2, 1],
    ['c2', 'judge2', 'Court Room 2', 2, 2],
    ['c4', 'judge', 'Court Room 1', 3, 3],
    ['c6', 'judge5', 'Bench II', 3, 3],
    ['c7', 'judge6', 'Bench III', 4, 4],
    ['n3', 'judge3', 'Bench I', 4, 2],
    ['c8', 'judge2', 'Court Room 2', 5, 1],
    ['bashir', 'judge2', 'Court Room 2', 6, 1],
    // Deliberate clash (inserted directly, bypassing the check): lawyer2 is also in Court Room 1 at this time.
    ['cx', 'judge4', 'Court Room 3', 3, 3],
  ] as const;
  for (const [key, judge, room, day, slot] of plan) {
    const date = workingDayAfterToday(day);
    await prisma.hearing.create({
      data: {
        caseId: caseIds[key],
        judgeId: ids[judge],
        courtroomId: courts.courtrooms[room],
        date,
        timeSlot: slot,
        startTime: slotTime(slot),
        purpose: key === 'cx' ? `${MARKER} (deliberate lawyer clash)` : `${MARKER}`,
      },
    });
    await prisma.case.update({ where: { id: caseIds[key] }, data: { status: 'HEARING_FIXED' } });
    await prisma.caseEvent.create({
      data: {
        caseId: caseIds[key],
        type: 'HEARING_SCHEDULED',
        description: `Hearing scheduled for ${date.toISOString().slice(8, 10)}-${date.toISOString().slice(5, 7)}-${date.getUTCFullYear()} at ${slotTime(slot)} in ${room}.`,
        actorId: ids.admin,
      },
    });
  }

  // Published cause list for the next working day, an unpublished one for the day after.
  const published = workingDayAfterToday(1);
  const draft = workingDayAfterToday(2);
  for (const courtId of [courts.sessions.id, courts.lhc.id]) {
    const list = await prisma.causeList.upsert({
      where: { courtId_date: { courtId, date: published } },
      update: {},
      create: {
        courtId,
        date: published,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdById: ids.admin,
      },
    });
    const hearings = await prisma.hearing.findMany({
      where: { date: published, status: { not: 'CANCELLED' }, courtroom: { courtId } },
      orderBy: [{ courtroom: { name: 'asc' } }, { timeSlot: 'asc' }],
    });
    await prisma.causeListEntry.deleteMany({ where: { causeListId: list.id } });
    await prisma.causeListEntry.createMany({
      data: hearings.map((h, i) => ({ causeListId: list.id, hearingId: h.id, serialNo: i + 1 })),
    });
    await prisma.causeList.upsert({
      where: { courtId_date: { courtId, date: draft } },
      update: {},
      create: { courtId, date: draft, status: 'DRAFT', createdById: ids.admin },
    });
  }
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
Two lawyers are intentionally PENDING verification: "Faisal Kharal" (bar number the mock Bar Council finds) and "Omar Cheema" (revoked bar number).
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
  await seedAllocationSamples(ids, lawyerProfileIds, reference);
  await seedScheduling(ids, lawyerProfileIds, reference);
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
