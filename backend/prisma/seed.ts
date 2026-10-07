/**
 * Development seed. Safe to re-run:
 *  - reference data (courts, fees, settings) and users are upserted;
 *  - sample cases are only created when the database has none;
 *  - dev passwords are regenerated on every run and written to docs/DEV_ACCOUNTS.md (git-ignored).
 * All names and CNICs are fictional (CNICs use the 36302-9xxxxxx-x range on purpose).
 */
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { CaseType, PartyRole, Prisma, PrismaClient, Role } from '../src/generated/prisma/client';
import { computeEventHash } from '../src/audit/audit-hash';
import { generateUcn } from '../src/cases/ucn';
import { nextChallanNo, nextReceiptNo, nextSequence } from '../src/common/counters';
import { calculateLedger, feeInputHash } from '../src/fees/fee-calculator';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { EvidenceCryptoService } from '../src/evidence/evidence-crypto.service';
import { SealService } from '../src/summons/seal.service';
import { LocalStorageService } from '../src/storage/local-storage.service';

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
  {
    key: 'intern2',
    role: 'INTERN',
    firstName: 'Hamza',
    lastName: 'Sheikh',
    email: `intern2@${DOMAIN}`,
    dev: true,
  },
  {
    key: 'server2',
    role: 'PROCESS_SERVER',
    firstName: 'Imtiaz',
    lastName: 'Hussain',
    email: `server2@${DOMAIN}`,
    dev: true,
  },
  {
    key: 'server3',
    role: 'PROCESS_SERVER',
    firstName: 'Zubair',
    lastName: 'Ahmed',
    email: `server3@${DOMAIN}`,
    dev: true,
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
  await prisma.internProfile.upsert({
    where: { userId: ids.intern2 },
    update: {},
    create: {
      userId: ids.intern2,
      supervisorId: lawyerProfileIds.lawyer,
      startDate: new Date('2026-09-15'),
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
      ledger: [],
      inputHash: '',
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
      recipientName: 'Sample Respondent',
      serviceAddress: 'House 22, Street 4, Shah Rukn-e-Alam Colony, Multan',
      sector: 'Shah Rukn-e-Alam Colony',
      dueBy: utcDate(2),
    },
  });

  // Chamber data for the main lawyer.
  const client = await prisma.chamberClient.create({
    data: {
      lawyerId: lawyers.lawyer,
      clientCode: 'CL-000001',
      cnic: '36302-9100001-1',
      caseType: 'Bail Application',
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
      amountPkr: '12500.00',
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
      keywords: ['bail', 'procedure'],
      citation: 'Cr.P.C. section 497',
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
      category: 'USABILITY',
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

/** Phase 4A demo data: fee policy defaults, challans and payments for the sample cases, feedback. */
async function seedPhase4(ids: Record<string, string>) {
  const policy: [string, string, string][] = [
    ['ad_valorem_percent', '1', 'Ad valorem percentage for Civil Suits'],
    ['ad_valorem_cap_pkr', '50000', 'Cap on the ad valorem fee (PKR)'],
    ['challan_due_days', '7', 'Days until a challan is due'],
    ['max_evidence_mb', '100', 'Maximum evidence file size in MB'],
    ['filing_fee_rate_modifier', '0', 'Filing fee rate modifier (percent)'],
  ];
  for (const [key, value, description] of policy) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  // Legacy sample challans (CH-2026-000001) predate the counter: move the counter past them.
  const year = new Date().getUTCFullYear();
  const known = await prisma.challan.findMany({
    where: { challanNo: { startsWith: `CH-${year}-` } },
    select: { challanNo: true },
  });
  const highest = Math.max(0, ...known.map((c) => Number(c.challanNo.slice(-6))));
  const counter = await prisma.caseCounter.findUnique({
    where: { year_typeCode: { year, typeCode: 'CH' } },
  });
  if (!counter || counter.lastValue < highest) {
    await prisma.caseCounter.upsert({
      where: { year_typeCode: { year, typeCode: 'CH' } },
      update: { lastValue: highest },
      create: { year, typeCode: 'CH', lastValue: highest },
    });
  }

  // Claim values for two civil suits.
  await prisma.case.updateMany({
    where: { title: 'Sana Noreen vs. Bilal Ahmed', claimAmountPkr: null },
    data: { claimAmountPkr: '1850000' },
  });
  await prisma.case.updateMany({
    where: { title: 'Ayesha Siddiqui vs. Kamran Siddiqui', claimAmountPkr: null },
    data: { claimAmountPkr: '500000' },
  });

  const rate = async (key: string, fallback: string) =>
    (await prisma.systemSetting.findUnique({ where: { key } }))?.value ?? fallback;
  const percent = await rate('ad_valorem_percent', '1');
  const cap = await rate('ad_valorem_cap_pkr', '50000');
  const modifier = await rate('filing_fee_rate_modifier', '0');
  const dueDays = Number(await rate('challan_due_days', '7'));

  const cases = await prisma.case.findMany({
    where: { status: { not: 'DRAFT' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { challans: true },
  });
  // Pending cases: the first two are PAID (so they can be allocated), the rest stay UNPAID.
  let paidPending = 0;
  for (const c of cases) {
    const fee = await prisma.feeStructure.findFirst({
      where: { caseType: c.caseType, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    const inputs = {
      caseType: c.caseType,
      baseFee: fee?.amount.toString() ?? '0',
      claimAmountPkr: c.claimAmountPkr?.toString() ?? null,
      adValoremPercent: percent,
      adValoremCapPkr: cap,
      rateModifierPercent: modifier,
    };
    const { lines, total } = calculateLedger(inputs);
    const hash = feeInputHash(inputs);
    const existing = c.challans[0];
    if (existing) {
      // Challans from earlier seeds get a ledger.
      if (existing.inputHash === '') {
        await prisma.challan.update({
          where: { id: existing.id },
          data: { amount: total, ledger: lines as never, inputHash: hash },
        });
      }
      continue;
    }
    const pending = c.status === 'PENDING_ASSIGNMENT';
    const paid = !pending || paidPending++ < 2;
    await prisma.$transaction(async (tx) => {
      const challan = await tx.challan.create({
        data: {
          challanNo: await nextChallanNo(tx),
          caseId: c.id,
          payerId: c.filedById,
          amount: total,
          status: paid ? 'PAID' : 'UNPAID',
          dueDate: utcDate(paid ? -20 : dueDays),
          ledger: lines as never,
          inputHash: hash,
        },
      });
      if (paid) {
        await tx.payment.create({
          data: {
            challanId: challan.id,
            payerId: c.filedById,
            amount: total,
            method: 'MOCK_CARD',
            status: 'SUCCESS',
            gatewayRef: `MOCK-SEED-${challan.challanNo.slice(-6)}`,
            receiptNo: await nextReceiptNo(tx),
            cardBrand: 'VISA',
            cardLast4: '4242',
            paidAt: utcDate(-20),
          },
        });
        await tx.caseEvent.create({
          data: {
            caseId: c.id,
            type: 'PAYMENT_RECEIVED',
            description: `Court fee of PKR ${total.toFixed(2)} received (challan ${challan.challanNo}).`,
            actorId: c.filedById,
            createdAt: utcDate(-20),
          },
        });
      }
    });
  }

  const samples = [
    [
      'litigant',
      4,
      'USABILITY',
      'NEW',
      false,
      'The filing wizard is clear, but the PDF size message could say how large my file was.',
    ],
    [
      'lawyer',
      5,
      'SUGGESTION',
      'PROCESSED',
      true,
      'Please add a calendar view of all my hearings for the month in the lawyer portal.',
    ],
    [
      'litigant2',
      2,
      'TECHNICAL_ISSUE',
      'NEW',
      false,
      'The page froze for a few seconds after I uploaded two pleadings together.',
    ],
    [
      'lawyer2',
      null,
      'OTHER',
      'ARCHIVED',
      false,
      'Thank you for the quick verification of my bar credentials this week.',
    ],
    [
      'litigant',
      3,
      'SUGGESTION',
      'NEW',
      false,
      'It would help to get a text message the day before a hearing as well.',
    ],
  ] as const;
  for (const [user, rating, category, status, forward, message] of samples) {
    if (await prisma.feedback.findFirst({ where: { message } })) continue;
    await prisma.feedback.create({
      data: {
        userId: ids[user],
        rating,
        category,
        status,
        forwardToMaintenance: forward,
        message,
        ...(status === 'NEW' ? {} : { reviewedById: ids.admin, reviewedAt: new Date() }),
      },
    });
  }
}

/** Phase 4B: chambers, clients, billing, retainers, expenses, interns, research logs, attendance, geo-fences. */
async function seedPhase4B(ids: Record<string, string>, lawyers: Record<string, string>) {
  const settings: [string, string, string][] = [
    ['attendance_default_radius_m', '300', 'Default court geo-fence radius in metres'],
    [
      'attendance_max_accuracy_m',
      '150',
      'Worst location accuracy accepted for attendance, in metres',
    ],
  ];
  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  // Placeholder geo-fences for Multan. APPROXIMATE: the administrator sets the real coordinates on Courts & Benches.
  const fences: [string, string, string, number][] = [
    ['District & Sessions Court Multan', '30.157500', '71.524900', 300],
    ['Lahore High Court Multan Bench', '30.201000', '71.469000', 300],
  ];
  for (const [name, latitude, longitude, geofenceRadiusM] of fences) {
    await prisma.court.updateMany({
      where: { name, latitude: null },
      data: { latitude, longitude, geofenceRadiusM },
    });
  }

  // One chamber per verified lawyer.
  const verified = await prisma.lawyerProfile.findMany({
    where: { verificationStatus: 'VERIFIED' },
    include: { user: true, chamber: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const l of verified) {
    if (l.chamber) continue;
    const n = await nextSequence(prisma, 'CHAMBER', 0);
    await prisma.chamberProfile.create({
      data: {
        lawyerId: l.id,
        chamberCode: `CH-${String(n).padStart(6, '0')}`,
        name: `${l.user.lastName} & Associates`,
        email: l.user.email,
        phone: l.user.phone,
      },
    });
  }
  const main = await prisma.chamberProfile.findUniqueOrThrow({
    where: { lawyerId: lawyers.lawyer },
  });
  await prisma.chamberProfile.update({
    where: { id: main.id },
    data: {
      officeAddress: 'Office 4, Law Chambers Building, Kachehri Road, Multan',
      partnerNames: ['Barrister Saad Raza', 'Ms. Hira Anwar'],
      barMembershipIds: ['MBA-2016-0101', 'PBC-ENR-44120'],
      practiceVerticals: ['Criminal Defence', 'Civil Litigation', 'Constitutional Writs'],
    },
  });

  const addClients = async (
    lawyerId: string,
    rows: { name: string; cnic: string; phone: string; caseType: string; daysAgo: number }[],
  ) => {
    const out: Record<string, string> = {};
    for (const r of rows) {
      let c = await prisma.chamberClient.findFirst({ where: { lawyerId, cnic: r.cnic } });
      if (!c) {
        const n = await nextSequence(prisma, `CL:${lawyerId}`, 0);
        c = await prisma.chamberClient.create({
          data: {
            lawyerId,
            clientCode: `CL-${String(n).padStart(6, '0')}`,
            name: r.name,
            cnic: r.cnic,
            phone: r.phone,
            caseType: r.caseType,
            onboardedOn: utcDate(-r.daysAgo),
          },
        });
        out[r.cnic] = c.id;
      }
    }
    return out;
  };

  // Keep the counter of the main chamber past the legacy client (CL-000001).
  await prisma.caseCounter.upsert({
    where: { year_typeCode: { year: 0, typeCode: `CL:${lawyers.lawyer}` } },
    update: {},
    create: { year: 0, typeCode: `CL:${lawyers.lawyer}`, lastValue: 1 },
  });
  const legacy = await prisma.chamberClient.findFirst({
    where: { lawyerId: lawyers.lawyer, name: 'Muhammad Ali' },
  });
  if (legacy && !legacy.cnic) {
    await prisma.chamberClient.update({
      where: { id: legacy.id },
      data: { cnic: '36302-9100001-1', caseType: 'Bail Application' },
    });
  }

  const fresh = await addClients(lawyers.lawyer, [
    {
      name: 'Zainab Fatima',
      cnic: '36302-9100002-3',
      phone: '+92 300 1000021',
      caseType: 'Civil Suit',
      daysAgo: 60,
    },
    {
      name: 'Rana Tahir',
      cnic: '36302-9100003-5',
      phone: '+92 300 1000022',
      caseType: 'Criminal Appeal',
      daysAgo: 45,
    },
    {
      name: 'Hina Aslam',
      cnic: '36302-9100004-7',
      phone: '+92 300 1000023',
      caseType: 'Writ Petition',
      daysAgo: 20,
    },
  ]);
  const other = await addClients(lawyers.lawyer2, [
    // The same CNIC as Zainab Fatima: allowed because it is another chamber.
    {
      name: 'Zainab Fatima',
      cnic: '36302-9100002-3',
      phone: '+92 300 1000021',
      caseType: 'Family Law',
      daysAgo: 30,
    },
  ]);

  const rate = '15000.00';
  const bill = async (
    lawyerId: string,
    clientId: string,
    hours: string,
    daysAgo: number,
    description: string,
    charge = true,
  ) => {
    const amount = (Number(hours) * Number(rate)).toFixed(2);
    const e = await prisma.billableEntry.create({
      data: {
        lawyerId,
        clientId,
        workedOn: utcDate(-daysAgo),
        hours,
        hourlyRate: rate,
        amountPkr: amount,
        description,
      },
    });
    if (charge) {
      await prisma.retainerTransaction.create({
        data: { clientId, type: 'DEDUCTION', amount, billableEntryId: e.id, note: description },
      });
    }
  };
  const deposit = (clientId: string, amount: string, note: string) =>
    prisma.retainerTransaction.create({
      data: { clientId, type: 'DEPOSIT', amount, note, reference: note },
    });

  const zainab = fresh['36302-9100002-3'];
  if (zainab) {
    // LOW: balance PKR 15,000 against a threshold of PKR 20,000.
    await deposit(zainab, '40000.00', 'Initial retainer');
    await bill(lawyers.lawyer, zainab, '1.50', 38, 'Drafting plaint and annexures');
    await bill(lawyers.lawyer, zainab, '0.75', 17, 'Conference with client on written statement');
  }
  const tahir = fresh['36302-9100003-5'];
  if (tahir) {
    // OVERDRAWN: deductions exceed deposits.
    await deposit(tahir, '20000.00', 'Initial retainer');
    await bill(lawyers.lawyer, tahir, '1.75', 31, 'Reviewing trial court record');
    await bill(lawyers.lawyer, tahir, '3.50', 10, 'Drafting memorandum of appeal');
  }
  const hina = fresh['36302-9100004-7'];
  if (hina) {
    await deposit(hina, '100000.00', 'Initial retainer');
    await bill(lawyers.lawyer, hina, '3.50', 3, 'Drafting constitutional writ petition response');
    await bill(lawyers.lawyer, hina, '2.00', 24, 'Legal research on service matters');
    await bill(lawyers.lawyer, hina, '1.25', 6, 'Client meeting and document review', false);
  }
  if (
    legacy &&
    (await prisma.billableEntry.count({
      where: { clientId: legacy.id, description: 'Court attendance' },
    })) === 0
  ) {
    await bill(lawyers.lawyer, legacy.id, '0.50', 12, 'Court attendance', false);
  }
  const zainab2 = other['36302-9100002-3'];
  if (zainab2) {
    await deposit(zainab2, '60000.00', 'Initial retainer');
    await bill(
      lawyers.lawyer2,
      zainab2,
      '2.00',
      5,
      'Drafting application under the family court act',
    );
  }

  if (
    (await prisma.chamberExpense.count({
      where: { lawyerId: lawyers.lawyer, category: 'Court stationery' },
    })) === 0
  ) {
    await prisma.chamberExpense.createMany({
      data: [
        {
          lawyerId: lawyers.lawyer,
          category: 'Court stationery',
          amount: '3200.00',
          spentOn: utcDate(-2),
          description: 'Stamp papers and files',
        },
        {
          lawyerId: lawyers.lawyer,
          category: 'Travel',
          amount: '4500.00',
          spentOn: utcDate(-9),
          description: 'Lahore trip for hearing',
        },
        {
          lawyerId: lawyers.lawyer,
          category: 'Law reports subscription',
          amount: '12000.00',
          spentOn: utcDate(-20),
        },
        {
          lawyerId: lawyers.lawyer,
          category: 'Office utilities',
          amount: '8800.00',
          spentOn: utcDate(-5),
        },
      ],
    });
  }

  // Research logs in every review status, on cases where the supervising lawyer is counsel.
  const intern = await prisma.internProfile.findUniqueOrThrow({ where: { userId: ids.intern } });
  const caseRows = await prisma.caseParty.findMany({
    where: { lawyerId: lawyers.lawyer, case: { status: { not: 'DRAFT' } } },
    select: { caseId: true },
    distinct: ['caseId'],
    take: 3,
  });
  if (
    caseRows.length > 0 &&
    (await prisma.internDiaryEntry.count({
      where: { internId: intern.id, citation: { startsWith: 'PLD' } },
    })) === 0
  ) {
    const logs = [
      {
        status: 'SUBMITTED' as const,
        keywords: ['bail', 'section 497'],
        citation: 'PLD 2022 SC 100',
        content:
          'Grounds for post-arrest bail where further inquiry is required. The Supreme Court restated that bail is the rule and refusal the exception, and that tentative assessment suffices at this stage.',
      },
      {
        status: 'APPROVED' as const,
        keywords: ['limitation', 'condonation'],
        citation: '2021 SCMR 450',
        content:
          'Condonation of delay requires a sufficient cause shown for every day of delay. Notes on how the courts treat counsel negligence and illness as grounds, with the leading cases listed.',
        comment: 'Good summary. Add the date of each authority next time.',
      },
      {
        status: 'NEEDS_REVISION' as const,
        keywords: ['writ', 'article 199'],
        citation: 'PLD 2019 Lah 211',
        content:
          'Maintainability of a constitutional petition when an alternate remedy exists. Rough notes only; the exceptions for want of jurisdiction still have to be traced and cited.',
        comment: 'Please cite the exceptions properly and attach the full reference.',
      },
    ];
    for (const [i, l] of logs.entries()) {
      const reviewed = l.status !== 'SUBMITTED';
      await prisma.internDiaryEntry.create({
        data: {
          internId: intern.id,
          caseId: caseRows[i % caseRows.length].caseId,
          entryDate: utcDate(-(i + 1) * 2),
          keywords: l.keywords,
          citation: l.citation,
          content: l.content,
          reviewStatus: l.status,
          ...(reviewed
            ? { reviewerId: ids.lawyer, reviewedAt: utcDate(-i), reviewComment: l.comment }
            : {}),
        },
      });
    }
  }

  // A week of verified attendance for the first intern (the second intern has none yet).
  const sessions = await prisma.court.findUniqueOrThrow({
    where: { name: 'District & Sessions Court Multan' },
  });
  for (let d = 1; d <= 7; d++) {
    const date = utcDate(-d);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const checkInAt = new Date(date.getTime() + (9 * 60 + 5 + d) * 60_000 - 5 * 3_600_000);
    await prisma.attendance.upsert({
      where: { internId_date: { internId: intern.id, date } },
      update: { courtId: sessions.id },
      create: {
        internId: intern.id,
        date,
        checkInAt,
        checkOutAt: new Date(checkInAt.getTime() + 5 * 3_600_000),
        lat: (30.1575 + d * 0.00005).toFixed(6),
        lng: (71.5249 - d * 0.00004).toFixed(6),
        distanceMeters: 20 + d * 4,
        withinGeofence: true,
        courtId: sessions.id,
        accuracyM: 25,
      },
    });
  }
}

// ---------------------------------------------------------------- phase 4C

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

/** A tiny valid RGB PNG. `paint(x, y)` returns the pixel colour. */
function makePng(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function seedPhase4C(ids: Record<string, string>) {
  const policy: [string, string, string][] = [
    [
      'summons_max_gps_accuracy_m',
      '100',
      'Worst GPS accuracy accepted for summons progress and proof, in metres',
    ],
    ['summons_default_due_days', '7', 'Default number of days until a summons is due'],
  ];
  for (const [key, value, description] of policy) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  const sessions = await prisma.court.findUniqueOrThrow({
    where: { name: 'District & Sessions Court Multan' },
  });
  const lhc = await prisma.court.findUniqueOrThrow({
    where: { name: 'Lahore High Court Multan Bench' },
  });
  const servers: [string, string, string, string][] = [
    [ids.server, 'PS-1001', sessions.id, 'Gulgasht Colony'],
    [ids.server2, 'PS-1002', sessions.id, 'Shah Rukn-e-Alam Colony'],
    [ids.server3, 'PS-2001', lhc.id, 'Cantt Area'],
  ];
  for (const [userId, badgeNumber, courtId, sector] of servers) {
    await prisma.processServerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, badgeNumber, courtId, sector },
    });
  }

  if ((await prisma.summons.count({ where: { issuedById: ids.admin } })) > 0) {
    console.log('Phase 4C summons already exist, skipping.');
    return;
  }

  const cfg = {
    get: (k: string) => process.env[k],
    getOrThrow: (k: string) => {
      const v = process.env[k] ?? (k === 'UPLOAD_DIR' ? join(process.cwd(), 'uploads') : undefined);
      if (!v) throw new Error(`${k} is not set`);
      return v;
    },
  } as never;
  const storage = new LocalStorageService(cfg);
  const crypto = new EvidenceCryptoService(cfg, storage);
  const seals = new SealService(cfg);

  const cases = await prisma.case.findMany({
    where: { judgeId: { not: null } },
    orderBy: { filingDate: 'asc' },
    select: { id: true, ucn: true, parties: { select: { id: true, name: true, role: true } } },
    take: 8,
  });
  if (cases.length === 0) return;
  const pick = (i: number) => {
    const c = cases[i % cases.length];
    const party = c.parties.find((p) => p.role === 'RESPONDENT') ?? c.parties[0];
    return { c, party };
  };

  const rows: {
    recipient: string;
    address: string;
    sector: string;
    priority: 'URGENT' | 'NORMAL';
    due: number;
    server: string | null;
    status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'ATTEMPT_IN_PROGRESS' | 'EXECUTED' | 'CANCELLED';
    attempts?: [string, number][];
    mode?: 'PERSONAL_DELIVERY' | 'REFUSED_AFFIXED';
    type?: 'SUMMONS' | 'NOTICE';
  }[] = [
    {
      recipient: 'Bilal Ahmed',
      address: 'House 14, Street 7, Gulgasht Colony, Multan',
      sector: 'Gulgasht Colony',
      priority: 'NORMAL',
      due: 6,
      server: null,
      status: 'PENDING_ASSIGNMENT',
    },
    {
      recipient: 'Kamran Siddiqui',
      address: 'Flat 3, Block C, Shah Rukn-e-Alam Colony, Multan',
      sector: 'Shah Rukn-e-Alam Colony',
      priority: 'NORMAL',
      due: -3,
      server: ids.server2,
      status: 'ASSIGNED',
    },
    {
      recipient: 'Nasir Mehmood',
      address: 'House 77, Street 12, Gulgasht Colony, Multan',
      sector: 'Gulgasht Colony',
      priority: 'URGENT',
      due: 2,
      server: ids.server,
      status: 'ASSIGNED',
      type: 'NOTICE',
    },
    {
      recipient: 'Sajid Iqbal',
      address: 'Shop 9, Hussain Agahi Bazaar, Multan',
      sector: 'Hussain Agahi',
      priority: 'NORMAL',
      due: 5,
      server: ids.server,
      status: 'ASSIGNED',
    },
    {
      recipient: 'Muhammad Rafiq',
      address: 'House 5, Street 2, Cantt Area, Multan',
      sector: 'Cantt Area',
      priority: 'URGENT',
      due: 1,
      server: ids.server3,
      status: 'ATTEMPT_IN_PROGRESS',
      attempts: [
        ['Premises locked, neighbour says family returns in the evening.', -2],
        ['Recipient refused to meet at the gate, asked to come back with a court officer.', -1],
      ],
    },
    {
      recipient: 'Farah Naz',
      address: 'House 31, Street 9, Gulgasht Colony, Multan',
      sector: 'Gulgasht Colony',
      priority: 'NORMAL',
      due: 4,
      server: ids.server,
      status: 'EXECUTED',
      mode: 'PERSONAL_DELIVERY',
      attempts: [['Recipient present, identity confirmed by CNIC.', -4]],
    },
    {
      recipient: 'Tahir Mahmood',
      address: 'House 18, Street 3, Shah Rukn-e-Alam Colony, Multan',
      sector: 'Shah Rukn-e-Alam Colony',
      priority: 'NORMAL',
      due: 3,
      server: ids.server2,
      status: 'EXECUTED',
      mode: 'REFUSED_AFFIXED',
      attempts: [['Recipient refused to accept the notice.', -3]],
    },
    {
      recipient: 'Ghulam Abbas',
      address: 'House 40, Street 1, Cantt Area, Multan',
      sector: 'Cantt Area',
      priority: 'NORMAL',
      due: 7,
      server: ids.server3,
      status: 'CANCELLED',
    },
  ];

  const photoPng = makePng(96, 64, (x, y) => [60 + x, 110 + y, 80]);
  const sigPng = makePng(120, 40, (x, y) =>
    Math.abs(y - 20 - Math.round(10 * Math.sin(x / 8))) < 2 ? [20, 20, 40] : [255, 255, 255],
  );
  const tmp = (name: string, buf: Buffer) => {
    const path = join(tmpdir(), `seed-${name}-${process.pid}.png`);
    writeFileSync(path, buf);
    return path;
  };

  for (const [i, r] of rows.entries()) {
    const { c, party } = pick(i);
    const s = await prisma.summons.create({
      data: {
        caseId: c.id,
        partyId: party?.id,
        noticeType: r.type ?? 'SUMMONS',
        recipientName: r.recipient,
        serviceAddress: r.address,
        sector: r.sector,
        priority: r.priority,
        status: r.status,
        serverId: r.server,
        issuedById: ids.admin,
        issuedAt: utcDate(-6),
        dueBy: utcDate(r.due),
        ...(r.status === 'CANCELLED'
          ? { cancelReason: 'Case withdrawn against this party.', cancelledAt: utcDate(-1) }
          : {}),
      },
    });
    await prisma.caseEvent.create({
      data: {
        caseId: c.id,
        type: 'SUMMONS_ISSUED',
        description: `${r.type === 'NOTICE' ? 'Notice' : 'Summons'} issued to ${r.recipient}.`,
        actorId: ids.admin,
        createdAt: utcDate(-6),
      },
    });
    for (const [notes, daysAgo] of r.attempts ?? []) {
      await prisma.summonsAttempt.create({
        data: {
          summonsId: s.id,
          serverId: r.server as string,
          createdAt: utcDate(daysAgo),
          latitude: (30.1575 + i * 0.001).toFixed(6),
          longitude: (71.5249 + i * 0.001).toFixed(6),
          accuracyM: (12 + i).toFixed(2),
          notes,
        },
      });
      await prisma.caseEvent.create({
        data: {
          caseId: c.id,
          type: 'SUMMONS_ATTEMPT',
          description: `Service attempt on ${r.recipient}: ${notes}`,
          createdAt: utcDate(daysAgo),
        },
      });
    }
    if (r.status === 'CANCELLED') {
      await prisma.caseEvent.create({
        data: {
          caseId: c.id,
          type: 'SUMMONS_CANCELLED',
          description: `Summons for ${r.recipient} cancelled by the registry.`,
          actorId: ids.admin,
        },
      });
    }
    if (r.status === 'EXECUTED' && r.mode && r.server) {
      const executedAt = new Date(utcDate(-1).getTime() + 10 * 3_600_000);
      const photoKey = `summons/${s.id}/photo-seed`;
      const pp = tmp('photo', photoPng);
      const p = await crypto.encryptToStorage(pp, photoKey);
      unlinkSync(pp);
      let sg: Awaited<ReturnType<typeof crypto.encryptToStorage>> | null = null;
      const sigKey = r.mode === 'PERSONAL_DELIVERY' ? `summons/${s.id}/signature-seed` : null;
      if (sigKey) {
        const sp = tmp('sig', sigPng);
        sg = await crypto.encryptToStorage(sp, sigKey);
        unlinkSync(sp);
      }
      const lat = '30.157800';
      const lng = '71.525100';
      const acc = '18.00';
      const notes =
        r.mode === 'PERSONAL_DELIVERY'
          ? 'Delivered in person, signature obtained.'
          : 'Recipient refused to accept; notice affixed to the gate.';
      const seal = seals.seal({
        summonsId: s.id,
        serverId: r.server,
        serviceMode: r.mode,
        executedAt,
        latitude: lat,
        longitude: lng,
        accuracyM: acc,
        notes,
        photoSha256: p.sha256,
        signatureSha256: sg?.sha256 ?? null,
      });
      await prisma.summons.update({
        where: { id: s.id },
        data: {
          serviceMode: r.mode,
          executedAt,
          executedLat: lat,
          executedLng: lng,
          executedAccuracy: acc,
          executionNotes: notes,
          photoPath: photoKey,
          photoIv: p.iv,
          photoTag: p.authTag,
          photoSha256: p.sha256,
          signaturePath: sigKey,
          signatureIv: sg?.iv ?? null,
          signatureTag: sg?.authTag ?? null,
          signatureSha256: sg?.sha256 ?? null,
          seal,
          sealedAt: executedAt,
        },
      });
      await prisma.caseEvent.create({
        data: {
          caseId: c.id,
          type: 'SUMMONS_EXECUTED',
          description: `Summons to ${r.recipient} executed (${r.mode === 'PERSONAL_DELIVERY' ? 'delivered in person' : 'refused, affixed to gate'}).`,
          createdAt: executedAt,
        },
      });
    }
  }
}

// ------------------------------------------------------------------ Phase 4E: decisions, security alerts

interface DecidedSpec {
  type: CaseType;
  title: string;
  relief: string;
  filer: string;
  counsel: string | null;
  judge: string;
  filedAgo: number;
  hearingsAgo: [number, 'HELD' | 'ADJOURNED'][];
  decidedAgo: number;
  decision: 'JUDGMENT' | 'DISMISSED' | 'DISPOSED';
  order: string;
}

const DECIDED: DecidedSpec[] = [
  {
    type: 'CIVIL_SUIT',
    title: 'Rukhsana Bibi vs. Habib Bank Limited',
    relief: 'Recovery of PKR 1,250,000 wrongly debited from the plaintiff account.',
    filer: 'litigant',
    counsel: null,
    judge: 'judge',
    filedAgo: 118,
    hearingsAgo: [
      [96, 'HELD'],
      [71, 'HELD'],
      [44, 'HELD'],
    ],
    decidedAgo: 44,
    decision: 'JUDGMENT',
    order:
      'The suit is decreed. The defendant bank shall refund PKR 1,250,000 with costs within thirty days of this order.',
  },
  {
    type: 'BAIL_APPLICATION',
    title: 'Naveed Iqbal vs. The State',
    relief: 'Post-arrest bail in FIR No. 214/2026, Police Station Cantt, Multan.',
    filer: 'lawyer',
    counsel: 'lawyer',
    judge: 'judge2',
    filedAgo: 92,
    hearingsAgo: [
      [80, 'ADJOURNED'],
      [66, 'HELD'],
      [52, 'HELD'],
    ],
    decidedAgo: 52,
    decision: 'DISPOSED',
    order:
      'Bail is allowed subject to surety bonds of PKR 200,000 and surrender of the passport. The application stands disposed of.',
  },
  {
    type: 'WRIT_PETITION',
    title: 'Multan Cloth Merchants vs. Excise Department',
    relief: 'Writ against the retrospective levy imposed by notification dated 04-05-2026.',
    filer: 'lawyer2',
    counsel: 'lawyer2',
    judge: 'judge3',
    filedAgo: 105,
    hearingsAgo: [
      [85, 'HELD'],
      [63, 'HELD'],
      [37, 'HELD'],
    ],
    decidedAgo: 37,
    decision: 'JUDGMENT',
    order:
      'The notification is declared to have no retrospective effect. The respondent shall refund any amount recovered under it.',
  },
  {
    type: 'CRIMINAL_APPEAL',
    title: 'Tariq Mahmood vs. The State',
    relief: 'Appeal against the conviction recorded in Sessions Case No. 77/2026.',
    filer: 'litigant2',
    counsel: null,
    judge: 'judge5',
    filedAgo: 110,
    hearingsAgo: [
      [90, 'HELD'],
      [58, 'HELD'],
    ],
    decidedAgo: 58,
    decision: 'DISMISSED',
    order:
      'The appeal is dismissed. The conviction and sentence recorded by the trial court are upheld.',
  },
  {
    type: 'CIVIL_SUIT',
    title: 'Fatima Zahra vs. Gulzar Ahmed',
    relief: 'Specific performance of the agreement to sell dated 12-01-2026.',
    filer: 'lawyer5',
    counsel: 'lawyer5',
    judge: 'judge4',
    filedAgo: 100,
    hearingsAgo: [
      [84, 'HELD'],
      [60, 'ADJOURNED'],
      [41, 'HELD'],
    ],
    decidedAgo: 41,
    decision: 'JUDGMENT',
    order:
      'The defendant shall execute the sale deed within sixty days on receipt of the balance sale price of PKR 900,000.',
  },
  {
    type: 'BAIL_APPLICATION',
    title: 'Asif Raza vs. The State',
    relief: 'Pre-arrest bail in FIR No. 118/2026, Police Station Mumtazabad, Multan.',
    filer: 'lawyer',
    counsel: 'lawyer',
    judge: 'judge',
    filedAgo: 70,
    hearingsAgo: [
      [60, 'HELD'],
      [49, 'HELD'],
    ],
    decidedAgo: 31,
    decision: 'DISPOSED',
    order:
      'Interim bail is confirmed on the same surety. The petitioner shall join the investigation as directed.',
  },
  {
    type: 'WRIT_PETITION',
    title: 'Shabana Kausar vs. Secretary Education',
    relief: 'Writ for the reinstatement of the petitioner in service with back benefits.',
    filer: 'litigant',
    counsel: null,
    judge: 'judge6',
    filedAgo: 95,
    hearingsAgo: [
      [75, 'HELD'],
      [48, 'HELD'],
      [28, 'HELD'],
    ],
    decidedAgo: 28,
    decision: 'JUDGMENT',
    order:
      'The termination order is set aside. The petitioner shall be reinstated with back benefits within thirty days.',
  },
  {
    type: 'CIVIL_SUIT',
    title: 'Adnan Sheikh vs. Rafi Traders',
    relief: 'Recovery of PKR 780,000 on a dishonoured cheque.',
    filer: 'litigant2',
    counsel: null,
    judge: 'judge2',
    filedAgo: 80,
    hearingsAgo: [
      [62, 'HELD'],
      [39, 'HELD'],
    ],
    decidedAgo: 24,
    decision: 'DISMISSED',
    order:
      'The suit is dismissed for want of proof of the underlying transaction. Parties shall bear their own costs.',
  },
  {
    type: 'CRIMINAL_APPEAL',
    title: 'Munir Hussain vs. The State',
    relief: 'Appeal against the sentence in Sessions Case No. 52/2026.',
    filer: 'lawyer3',
    counsel: 'lawyer3',
    judge: 'judge',
    filedAgo: 84,
    hearingsAgo: [
      [66, 'HELD'],
      [40, 'HELD'],
    ],
    decidedAgo: 19,
    decision: 'JUDGMENT',
    order:
      'The sentence is reduced to the period already undergone. The appellant shall be released if not required in another case.',
  },
  {
    type: 'WRIT_PETITION',
    title: 'Al-Noor Welfare Trust vs. Municipal Corporation',
    relief: 'Writ against the demolition notice dated 21-07-2026.',
    filer: 'lawyer2',
    counsel: 'lawyer2',
    judge: 'judge5',
    filedAgo: 72,
    hearingsAgo: [
      [55, 'HELD'],
      [33, 'ADJOURNED'],
      [16, 'HELD'],
    ],
    decidedAgo: 16,
    decision: 'DISPOSED',
    order:
      'The respondent has withdrawn the notice. The petition is disposed of as having become infructuous.',
  },
  {
    type: 'BAIL_APPLICATION',
    title: 'Ghulam Abbas vs. The State',
    relief: 'Post-arrest bail in FIR No. 301/2026, Police Station Saddar, Multan.',
    filer: 'lawyer5',
    counsel: 'lawyer5',
    judge: 'judge4',
    filedAgo: 52,
    hearingsAgo: [
      [40, 'HELD'],
      [22, 'HELD'],
    ],
    decidedAgo: 12,
    decision: 'DISMISSED',
    order:
      'Bail is declined. The prosecution has made out a prima facie case on the record produced.',
  },
  {
    type: 'CIVIL_SUIT',
    title: 'Saima Parveen vs. Zafar Iqbal',
    relief: 'Maintenance allowance and recovery of dowry articles.',
    filer: 'litigant',
    counsel: null,
    judge: 'judge2',
    filedAgo: 66,
    hearingsAgo: [
      [50, 'HELD'],
      [27, 'HELD'],
      [9, 'HELD'],
    ],
    decidedAgo: 9,
    decision: 'JUDGMENT',
    order:
      'Maintenance of PKR 25,000 per month is fixed from the date of the suit. The dowry articles shall be returned within thirty days.',
  },
  {
    type: 'WRIT_PETITION',
    title: 'Pak Cotton Ginners vs. Federal Board of Revenue',
    relief: 'Writ against the adjustment of input tax disallowed by the department.',
    filer: 'lawyer',
    counsel: 'lawyer',
    judge: 'judge3',
    filedAgo: 60,
    hearingsAgo: [
      [46, 'HELD'],
      [21, 'HELD'],
      [6, 'HELD'],
    ],
    decidedAgo: 6,
    decision: 'JUDGMENT',
    order:
      'The disallowance is declared unlawful. The respondent shall allow the adjustment and issue a fresh assessment order.',
  },
  {
    type: 'CRIMINAL_APPEAL',
    title: 'Javed Akhtar vs. The State',
    relief: 'Appeal against the order of the Anti-Terrorism Court dated 02-08-2026.',
    filer: 'litigant2',
    counsel: null,
    judge: 'judge6',
    filedAgo: 48,
    hearingsAgo: [
      [35, 'HELD'],
      [14, 'HELD'],
    ],
    decidedAgo: 3,
    decision: 'DISMISSED',
    order:
      'The appeal is dismissed as barred by limitation. No sufficient cause for the delay has been shown.',
  },
];

const ADJOURNED_OPEN: {
  title: string;
  type: CaseType;
  relief: string;
  filer: string;
  judge: string;
  ago: number;
}[] = [
  {
    title: 'Zeeshan Haider vs. Multan Development Authority',
    type: 'CIVIL_SUIT',
    relief: 'Injunction against the cancellation of the commercial plot allotment.',
    filer: 'litigant',
    judge: 'judge',
    ago: 1,
  },
  {
    title: 'Hafiz Rehman vs. The State',
    type: 'BAIL_APPLICATION',
    relief: 'Post-arrest bail in FIR No. 402/2026, Police Station Bosan Road, Multan.',
    filer: 'lawyer2',
    judge: 'judge3',
    ago: 2,
  },
];

async function seedPhase4E(ids: Record<string, string>, lawyers: Record<string, string>) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'security_escalation_threshold' },
  });
  if (!setting) {
    await prisma.systemSetting.create({
      data: {
        key: 'security_escalation_threshold',
        value: '3',
        description: 'Refused admin-route attempts within 10 minutes that raise a security alert',
      },
    });
  }

  const sessions = await prisma.court.findUniqueOrThrow({
    where: { name: 'District & Sessions Court Multan' },
  });
  const lhc = await prisma.court.findUniqueOrThrow({
    where: { name: 'Lahore High Court Multan Bench' },
  });
  const rooms = await prisma.courtroom.findMany({
    select: { id: true, name: true, courtId: true },
  });
  const judgeInfo = async (key: string) => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: ids[key] },
      select: { id: true, courtId: true, courtroomId: true, firstName: true, lastName: true },
    });
    const court = u.courtId === sessions.id ? sessions : lhc;
    const room =
      rooms.find((r) => r.id === u.courtroomId) ?? rooms.find((r) => r.courtId === court.id);
    return { ...u, court, roomId: room?.id ?? null, roomName: room?.name ?? '' };
  };

  // Legacy DECIDED cases (older phases) get a decision type and order so every decided case shows a decision.
  const legacy = await prisma.case.findMany({
    where: { status: 'DECIDED', decisionType: null },
    select: { id: true },
  });
  for (const c of legacy) {
    await prisma.case.update({
      where: { id: c.id },
      data: {
        decisionType: 'JUDGMENT',
        decisionText:
          'Decided on the record after hearing the parties. The detailed order was announced in court.',
      },
    });
  }

  const slotUse = new Map<string, number>();
  const nextSlot = async (judgeId: string, date: Date) => {
    const key = `${judgeId}|${date.toISOString().slice(0, 10)}`;
    if (!slotUse.has(key)) {
      const taken = await prisma.hearing.findMany({
        where: { judgeId, date, status: { not: 'CANCELLED' } },
        select: { timeSlot: true },
      });
      slotUse.set(key, Math.max(0, ...taken.map((t) => t.timeSlot)));
    }
    const n = (slotUse.get(key) ?? 0) + 1;
    slotUse.set(key, n);
    return n;
  };
  const clock = (slot: number) => `${String(8 + slot).padStart(2, '0')}:00`;
  const at = (ago: number, hour: number) => {
    const d = utcDate(-ago);
    d.setUTCHours(hour, 15, 0, 0);
    return d;
  };

  const decidedCount = await prisma.case.count({
    where: { decisionType: { not: null }, decidedAt: { not: null } },
  });
  if (decidedCount < 10) {
    for (const spec of DECIDED) {
      if (await prisma.case.findFirst({ where: { title: spec.title } })) continue;
      const judge = await judgeInfo(spec.judge);
      const [petitioner, respondent] = spec.title.split(' vs. ');
      const filingDate = utcDate(-spec.filedAgo);
      const decidedAt = at(spec.decidedAgo, 11);
      const caseId = await prisma.$transaction(async (tx) => {
        const ucn = await generateUcn(tx, spec.type, filingDate.getUTCFullYear());
        const created = await tx.case.create({
          data: {
            ucn,
            caseType: spec.type,
            status: 'DECIDED',
            title: spec.title,
            reliefSought: spec.relief,
            filingDate,
            filedById: ids[spec.filer],
            courtId: judge.court.id,
            courtroomId: judge.roomId,
            judgeId: judge.id,
            allocatedAt: utcDate(-(spec.filedAgo - 2)),
            decidedAt,
            decisionType: spec.decision,
            decisionText: spec.order,
            parties: {
              create: [
                {
                  role: spec.type === 'CRIMINAL_APPEAL' ? 'APPELLANT' : 'PETITIONER',
                  name: petitioner,
                  lawyerId: spec.counsel ? lawyers[spec.counsel] : null,
                },
                { role: 'RESPONDENT', name: respondent },
              ],
            },
          },
        });
        const events: Prisma.CaseEventCreateManyInput[] = [
          {
            caseId: created.id,
            type: 'CASE_SUBMITTED',
            description: `Case submitted as ${ucn} and pending assignment to a judge.`,
            actorId: ids[spec.filer],
            createdAt: filingDate,
          },
          {
            caseId: created.id,
            type: 'CASE_ALLOCATED',
            description: `Case allocated to ${judge.firstName} ${judge.lastName}, ${judge.court.name}, ${judge.roomName}.`,
            actorId: ids.admin,
            createdAt: utcDate(-(spec.filedAgo - 2)),
          },
        ];
        for (const [i, [ago, status]] of spec.hearingsAgo.entries()) {
          const date = utcDate(-ago);
          const slot = await nextSlot(judge.id, date);
          await tx.hearing.create({
            data: {
              caseId: created.id,
              courtroomId: judge.roomId,
              judgeId: judge.id,
              date,
              timeSlot: slot,
              startTime: clock(slot),
              status,
              purpose: i === 0 ? 'Admission and framing of issues' : 'Arguments and evidence',
              orderSummary:
                status === 'ADJOURNED'
                  ? 'Adjourned at the request of counsel; a new date will be fixed by the registry.'
                  : 'Parties heard. Matter proceeds to the next stage.',
              outcomeAt: at(ago, 12),
            },
          });
          events.push({
            caseId: created.id,
            type: status === 'ADJOURNED' ? 'HEARING_ADJOURNED' : 'HEARING_COMPLETED',
            description: `Hearing of ${date.toISOString().slice(8, 10)}-${date.toISOString().slice(5, 7)}-${date.getUTCFullYear()} ${status === 'ADJOURNED' ? 'adjourned' : 'completed'}.`,
            actorId: judge.id,
            createdAt: at(ago, 12),
          });
        }
        events.push({
          caseId: created.id,
          type: 'CASE_DECIDED',
          description: `Case decided: ${spec.decision === 'JUDGMENT' ? 'Judgment' : spec.decision === 'DISMISSED' ? 'Dismissed' : 'Disposed'}.`,
          actorId: judge.id,
          createdAt: decidedAt,
        });
        await tx.caseEvent.createMany({ data: events });
        return created.id;
      });
      // A hashed audit row so the vault shows verifiable history for the seeded decisions.
      const id = randomUUID();
      const meta = {
        ucn: (await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { ucn: true } }))
          .ucn,
        decisionType: spec.decision,
      };
      await prisma.auditLog.create({
        data: {
          id,
          createdAt: decidedAt,
          actorId: judge.id,
          actorRole: 'JUDGE',
          action: 'CASE_DECIDED',
          entity: 'Case',
          entityId: caseId,
          metadata: meta,
          eventHash: computeEventHash({
            id,
            createdAt: decidedAt,
            actorId: judge.id,
            action: 'CASE_DECIDED',
            entity: 'Case',
            entityId: caseId,
            metadata: meta,
          }),
        },
      });
    }
  }

  // Open cases whose latest hearing was adjourned: the registry still has to fix a new date.
  for (const spec of ADJOURNED_OPEN) {
    if (await prisma.case.findFirst({ where: { title: spec.title } })) continue;
    const judge = await judgeInfo(spec.judge);
    const [petitioner, respondent] = spec.title.split(' vs. ');
    const filingDate = utcDate(-30);
    await prisma.$transaction(async (tx) => {
      const ucn = await generateUcn(tx, spec.type, filingDate.getUTCFullYear());
      const created = await tx.case.create({
        data: {
          ucn,
          caseType: spec.type,
          status: 'PENDING',
          title: spec.title,
          reliefSought: spec.relief,
          filingDate,
          filedById: ids[spec.filer],
          courtId: judge.court.id,
          courtroomId: judge.roomId,
          judgeId: judge.id,
          allocatedAt: utcDate(-28),
          parties: {
            create: [
              {
                role: 'PETITIONER',
                name: petitioner,
                lawyerId: spec.filer.startsWith('lawyer') ? lawyers[spec.filer] : null,
              },
              { role: 'RESPONDENT', name: respondent },
            ],
          },
        },
      });
      const date = utcDate(-spec.ago);
      const slot = await nextSlot(judge.id, date);
      await tx.hearing.create({
        data: {
          caseId: created.id,
          courtroomId: judge.roomId,
          judgeId: judge.id,
          date,
          timeSlot: slot,
          startTime: clock(slot),
          status: 'ADJOURNED',
          purpose: 'Arguments',
          orderSummary:
            'Adjourned because the respondent counsel was unavailable. A new date is needed.',
          outcomeAt: at(spec.ago, 12),
        },
      });
      await tx.caseEvent.createMany({
        data: [
          {
            caseId: created.id,
            type: 'CASE_SUBMITTED',
            description: `Case submitted as ${ucn} and pending assignment to a judge.`,
            actorId: ids[spec.filer],
            createdAt: filingDate,
          },
          {
            caseId: created.id,
            type: 'CASE_ALLOCATED',
            description: `Case allocated to ${judge.firstName} ${judge.lastName}, ${judge.court.name}, ${judge.roomName}.`,
            actorId: ids.admin,
            createdAt: utcDate(-28),
          },
          {
            caseId: created.id,
            type: 'HEARING_ADJOURNED',
            description: 'Hearing adjourned. Order notes: A new date is needed.',
            actorId: judge.id,
            createdAt: at(spec.ago, 12),
          },
        ],
      });
    });
  }

  // Security: raw events and two alerts (one documentation-range address, one loopback). Nobody is signed out.
  if ((await prisma.securityAlert.count()) === 0) {
    const mk = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const events: Prisma.SecurityEventCreateManyInput[] = [
      ...[42, 40, 39].map((m) => ({
        type: 'PRIVILEGE_ESCALATION',
        actorId: ids.litigant2,
        role: 'LITIGANT' as Role,
        ip: '203.0.113.45',
        method: 'GET',
        route: '/api/admin/users',
        code: 'ADMIN_ROUTE_FORBIDDEN',
        createdAt: mk(m),
      })),
      ...[25, 24, 22, 21].map((m) => ({
        type: 'PRIVILEGE_ESCALATION',
        actorId: ids.lawyer3,
        role: 'LAWYER' as Role,
        ip: '::1',
        method: 'GET',
        route: '/api/admin/settings',
        code: 'ADMIN_ROUTE_FORBIDDEN',
        createdAt: mk(m),
      })),
      {
        type: 'PRIVILEGE_ESCALATION',
        actorId: null,
        role: null,
        ip: '198.51.100.7',
        method: 'GET',
        route: '/api/admin/audit-logs',
        code: 'ADMIN_ROUTE_INVALID_TOKEN',
        createdAt: mk(90),
      },
    ];
    await prisma.securityEvent.createMany({ data: events });
    const l2 = await prisma.user.findUniqueOrThrow({
      where: { id: ids.litigant2 },
      select: { email: true },
    });
    const l3 = await prisma.user.findUniqueOrThrow({
      where: { id: ids.lawyer3 },
      select: { email: true },
    });
    await prisma.securityAlert.createMany({
      data: [
        {
          actorId: ids.litigant2,
          actorEmail: l2.email,
          actorRole: 'LITIGANT',
          ip: '203.0.113.45',
          attemptCount: 3,
          lastActionCode: 'ADMIN_ROUTE_FORBIDDEN',
          lastRoute: '/api/admin/users',
          createdAt: mk(39),
        },
        {
          actorId: ids.lawyer3,
          actorEmail: l3.email,
          actorRole: 'LAWYER',
          ip: '::1',
          attemptCount: 4,
          lastActionCode: 'ADMIN_ROUTE_FORBIDDEN',
          lastRoute: '/api/admin/settings',
          createdAt: mk(21),
        },
      ],
    });
    console.log('Phase 4E: 2 open security alerts seeded.');
  }
}

/**
 * Phase 4F demo data: two virtual hearings on the current court day before judge/Court Room 1, one with an
 * initialized ACTIVE session (and participant rows) and one still locked. They are re-created on every run so the
 * demo always falls on the day the seed runs; run it during court hours to see an open room.
 */
async function seedPhase4F(ids: Record<string, string>, courtrooms: Record<string, string>) {
  const MARKER = 'Phase 4F virtual demo';
  const old = (
    await prisma.hearing.findMany({
      where: { purpose: { startsWith: MARKER } },
      select: { id: true },
    })
  ).map((h) => h.id);
  if (old.length > 0) {
    const sessions = (
      await prisma.courtSession.findMany({
        where: { hearingId: { in: old } },
        select: { id: true },
      })
    ).map((s) => s.id);
    await prisma.courtSessionParticipant.deleteMany({ where: { sessionId: { in: sessions } } });
    await prisma.courtSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.causeListEntry.deleteMany({ where: { hearingId: { in: old } } });
    await prisma.hearing.deleteMany({ where: { id: { in: old } } });
  }

  const setting = async (key: string, fallback: string) =>
    (await prisma.systemSetting.findUnique({ where: { key } }))?.value ?? fallback;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dayStart = toMin(await setting('court_day_start', '09:00'));
  const dayEnd = toMin(await setting('court_day_end', '14:00'));
  const slotMin = Number(await setting('hearing_slot_minutes', '30')) || 30;
  const slotCount = Math.max(1, Math.floor((dayEnd - dayStart) / slotMin));
  const clock = (slot: number) => {
    const m = dayStart + (slot - 1) * slotMin;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  // The local calendar day (as the scheduler stores it), moved to Monday on a weekend.
  const now = new Date();
  let date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  let isToday = true;
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date = new Date(date.getTime() + 86_400_000);
    isToday = false;
  }
  // The slot running now (or the next one); after court hours, the last slot of the day.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let target = 1;
  if (isToday) {
    target = slotCount;
    for (let n = 1; n <= slotCount; n++) {
      if (dayStart + n * slotMin > nowMin) {
        target = n;
        break;
      }
    }
  }
  const judgeId = ids.judge;
  const courtroomId = courtrooms['Court Room 1'];
  const taken = new Set(
    (
      await prisma.hearing.findMany({
        where: { date, status: { not: 'CANCELLED' }, OR: [{ judgeId }, { courtroomId }] },
        select: { timeSlot: true },
      })
    ).map((h) => h.timeSlot),
  );
  const order = [
    ...Array.from({ length: slotCount - target + 1 }, (_, i) => target + i),
    ...Array.from({ length: target - 1 }, (_, i) => target - 1 - i),
  ];
  const free = order.filter((n) => !taken.has(n));
  if (free.length < 2) {
    console.log('Phase 4F: no free slots for the virtual demo hearings today, skipping.');
    return;
  }

  const n1 = await prisma.case.findFirstOrThrow({
    where: { title: 'Muhammad Ali vs. The State' },
    select: { id: true, ucn: true, filedById: true },
  });
  const c1 = await prisma.case.findFirstOrThrow({
    where: { title: 'Imtiaz Ahmed vs. Punjab Revenue Authority' },
    select: { id: true, ucn: true, filedById: true },
  });
  const iso = date.toISOString();
  const dd = `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const make = (caseId: string, slot: number, purpose: string) =>
    prisma.hearing.create({
      data: {
        caseId,
        judgeId,
        courtroomId,
        date,
        timeSlot: slot,
        startTime: clock(slot),
        type: 'VIRTUAL',
        isVirtual: true,
        purpose: `${MARKER}: ${purpose}`,
      },
    });
  const live = await make(n1.id, free[0], 'bail arguments by video link');
  const locked = await make(c1.id, free[1], 'framing of issues by video link');
  for (const [h, c] of [
    [live, n1],
    [locked, c1],
  ] as const) {
    await prisma.case.update({ where: { id: c.id }, data: { status: 'HEARING_FIXED' } });
    await prisma.caseEvent.create({
      data: {
        caseId: c.id,
        type: 'HEARING_SCHEDULED',
        description: `Virtual hearing scheduled for ${dd} at ${h.startTime} in Court Room 1.`,
        actorId: ids.admin,
      },
    });
  }

  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  const ROOM = 'abcdefghijkmnpqrstuvwxyz23456789';
  const roomName = Array.from({ length: 24 }, () => ROOM[randomInt(ROOM.length)]).join('');
  await prisma.courtSession.create({
    data: {
      hearingId: live.id,
      roomName,
      status: 'ACTIVE',
      provider: process.env.JAAS_APP_ID ? 'JAAS' : 'JITSI_PUBLIC',
      initializedById: ids.admin,
      startedAt: ago(12),
      participants: {
        create: [
          { userId: judgeId, role: 'JUDGE', joinedAt: ago(10), lastSeenAt: ago(3) },
          {
            userId: ids.lawyer,
            role: 'LAWYER',
            status: 'MUTED',
            audioMuted: true,
            joinedAt: ago(9),
            lastSeenAt: ago(3),
            lastCommand: 'MUTE_AUDIO',
            lastCommandAt: ago(6),
            lastCommandById: ids.admin,
          },
          {
            userId: n1.filedById,
            role: 'LITIGANT',
            status: 'VIDEO_OFF',
            videoOff: true,
            joinedAt: ago(8),
            leftAt: ago(4),
            lastSeenAt: ago(4),
          },
        ],
      },
    },
  });
  await prisma.caseEvent.create({
    data: {
      caseId: n1.id,
      type: 'SESSION_INITIALIZED',
      description: `Virtual courtroom session opened for the hearing on ${dd} at ${live.startTime}.`,
      actorId: ids.admin,
      createdAt: ago(12),
    },
  });
  await prisma.notification.createMany({
    data: [...new Set([n1.filedById, ids.lawyer, judgeId])].map((userId) => ({
      userId,
      type: 'HEARING_VIRTUAL_SESSION_OPENED',
      title: 'Virtual courtroom open',
      body: `The virtual courtroom for your hearing is open. ${n1.ucn}, hearing on ${dd} at ${live.startTime}.`,
      channel: 'IN_APP' as const,
      sentAt: ago(12),
    })),
  });

  // Today's published cause list for the court lists both virtual hearings.
  const { courtId } = await prisma.courtroom.findUniqueOrThrow({
    where: { id: courtroomId },
    select: { courtId: true },
  });
  const list = await prisma.causeList.upsert({
    where: { courtId_date: { courtId, date } },
    update: {},
    create: { courtId, date, status: 'PUBLISHED', publishedAt: new Date(), createdById: ids.admin },
  });
  const max = await prisma.causeListEntry.aggregate({
    where: { causeListId: list.id },
    _max: { serialNo: true },
  });
  let serial = max._max.serialNo ?? 0;
  for (const h of [live, locked]) {
    await prisma.causeListEntry.create({
      data: { causeListId: list.id, hearingId: h.id, serialNo: ++serial },
    });
  }
  console.log(
    `Phase 4F: virtual hearings on ${dd} at ${live.startTime} (session ACTIVE) and ${locked.startTime} (locked).`,
  );
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
Chamber desk login (lawyers): use the Chamber ID shown on Chamber Settings & Identity Profile (format CH-123456) plus the lawyer email and password.
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
  await seedPhase4(ids);
  await seedPhase4B(ids, lawyerProfileIds);
  await seedPhase4C(ids);
  await seedPhase4E(ids, lawyerProfileIds);
  await seedPhase4F(ids, reference.courtrooms);
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
