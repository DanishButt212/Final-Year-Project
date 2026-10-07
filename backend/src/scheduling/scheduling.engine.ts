import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { fullName } from '../admin/constants';
import { addDays, isoDate, isWorkingDay, Slot, slotHasPassed, todayUtc } from './slots';

export type Db = Prisma.TransactionClient;

export type ConflictType = 'JUDGE' | 'COURTROOM' | 'LAWYER';

export interface Conflict {
  type: ConflictType;
  message: string;
  hearingId?: string;
  ucn?: string;
}

export const CLEAR_MESSAGE = 'Anti-clash verification successful: No schedule conflicts detected.';

const roomLabel = (name?: string | null) => name ?? 'another courtroom';
export const conflictMessages = {
  // Wording from the requirement document (UC-3.2).
  lawyer: (room?: string | null) =>
    `Scheduling Conflict: Lawyer has a matching court appearance time in ${roomLabel(room)}.`,
  // Our own wording (logged in docs/CHANGES.md).
  judge: (room?: string | null) =>
    `Scheduling Conflict: Judge has a matching hearing at the same time in ${roomLabel(room)}.`,
  courtroom: (room?: string | null) =>
    `Scheduling Conflict: ${room ?? 'This courtroom'} is already booked for this time slot.`,
};

export const scanInclude = {
  courtroom: { select: { id: true, name: true, courtId: true } },
  judge: { select: { id: true, firstName: true, lastName: true } },
  session: { select: { id: true, status: true } },
  case: {
    select: {
      id: true,
      ucn: true,
      title: true,
      filedById: true,
      parties: {
        select: {
          lawyerId: true,
          lawyer: {
            select: { userId: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.HearingInclude;

export type ScanHearing = Prisma.HearingGetPayload<{ include: typeof scanInclude }>;

export interface Candidate {
  courtroomId: string;
  judgeId: string;
  lawyerIds: string[];
  date: Date;
  slot: number;
  excludeHearingId?: string;
}

export const lawyerIdsOf = (h: ScanHearing) => [
  ...new Set(h.case.parties.map((p) => p.lawyerId).filter((x): x is string => Boolean(x))),
];

export const lawyerNamesOf = (h: ScanHearing) => [
  ...new Set(h.case.parties.flatMap((p) => (p.lawyer ? [fullName(p.lawyer.user)] : []))),
];

/** The anti-clash engine: pure reads, usable inside or outside a transaction. */
@Injectable()
export class SchedulingEngine {
  /** Judge, courtroom and every lawyer of the case must be free in the slot (cancelled hearings do not count). */
  async findConflicts(db: Db, c: Candidate): Promise<Conflict[]> {
    const base: Prisma.HearingWhereInput = {
      date: c.date,
      timeSlot: c.slot,
      status: { not: 'CANCELLED' },
      ...(c.excludeHearingId ? { id: { not: c.excludeHearingId } } : {}),
    };
    const pick = {
      id: true,
      courtroom: { select: { name: true } },
      case: { select: { ucn: true } },
    } as const;
    const conflicts: Conflict[] = [];

    const judge = await db.hearing.findFirst({
      where: { ...base, judgeId: c.judgeId },
      select: pick,
    });
    if (judge) {
      conflicts.push({
        type: 'JUDGE',
        message: conflictMessages.judge(judge.courtroom?.name),
        hearingId: judge.id,
        ucn: judge.case.ucn,
      });
    }
    const room = await db.hearing.findFirst({
      where: { ...base, courtroomId: c.courtroomId },
      select: pick,
    });
    if (room) {
      conflicts.push({
        type: 'COURTROOM',
        message: conflictMessages.courtroom(room.courtroom?.name),
        hearingId: room.id,
        ucn: room.case.ucn,
      });
    }
    if (c.lawyerIds.length > 0) {
      const lawyer = await db.hearing.findFirst({
        where: { ...base, case: { parties: { some: { lawyerId: { in: c.lawyerIds } } } } },
        select: pick,
      });
      if (lawyer) {
        conflicts.push({
          type: 'LAWYER',
          message: conflictMessages.lawyer(lawyer.courtroom?.name),
          hearingId: lawyer.id,
          ucn: lawyer.case.ucn,
        });
      }
    }
    return conflicts;
  }

  /** Every non-cancelled hearing of a date (all courts) with the conflicts each one is in, computed on read. */
  async scan(db: Db, date: Date) {
    const hearings = await db.hearing.findMany({
      where: { date, status: { not: 'CANCELLED' } },
      include: scanInclude,
      orderBy: [{ timeSlot: 'asc' }, { id: 'asc' }],
    });
    const conflicts = new Map<string, Conflict[]>();
    const bySlot = new Map<number, ScanHearing[]>();
    for (const h of hearings) bySlot.set(h.timeSlot, [...(bySlot.get(h.timeSlot) ?? []), h]);

    for (const group of bySlot.values()) {
      for (const a of group) {
        const list: Conflict[] = [];
        const lawyersA = new Set(lawyerIdsOf(a));
        for (const b of group) {
          if (a.id === b.id) continue;
          if (a.judgeId === b.judgeId) {
            list.push({
              type: 'JUDGE',
              message: conflictMessages.judge(b.courtroom?.name),
              hearingId: b.id,
              ucn: b.case.ucn,
            });
          }
          if (a.courtroomId && a.courtroomId === b.courtroomId) {
            list.push({
              type: 'COURTROOM',
              message: conflictMessages.courtroom(a.courtroom?.name),
              hearingId: b.id,
              ucn: b.case.ucn,
            });
          }
          if (lawyerIdsOf(b).some((id) => lawyersA.has(id))) {
            list.push({
              type: 'LAWYER',
              message: conflictMessages.lawyer(b.courtroom?.name),
              hearingId: b.id,
              ucn: b.case.ucn,
            });
          }
        }
        if (list.length > 0) conflicts.set(a.id, list);
      }
    }
    return { hearings, conflicts };
  }

  /** Vacancy mapping: free slots where the case's judge, a courtroom and all its lawyers are free. */
  async availableSlots(
    db: Db,
    input: {
      courtId: string;
      judgeId: string;
      lawyerIds: string[];
      from: Date;
      days: number;
      slots: Slot[];
      excludeHearingId?: string;
    },
  ) {
    const end = addDays(input.from, input.days - 1);
    const rooms = await db.courtroom.findMany({
      where: { courtId: input.courtId, isActive: true },
      orderBy: [{ benchNo: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
    const busy = await db.hearing.findMany({
      where: {
        date: { gte: input.from, lte: end },
        status: { not: 'CANCELLED' },
        ...(input.excludeHearingId ? { id: { not: input.excludeHearingId } } : {}),
        OR: [
          { judgeId: input.judgeId },
          { courtroom: { courtId: input.courtId } },
          ...(input.lawyerIds.length
            ? [{ case: { parties: { some: { lawyerId: { in: input.lawyerIds } } } } }]
            : []),
        ],
      },
      select: {
        date: true,
        timeSlot: true,
        judgeId: true,
        courtroomId: true,
        case: { select: { parties: { select: { lawyerId: true } } } },
      },
    });
    const lawyers = new Set(input.lawyerIds);
    const result: {
      date: string;
      slots: {
        slot: number;
        start: string;
        end: string;
        courtrooms: { id: string; name: string }[];
      }[];
    }[] = [];

    for (let i = 0; i < input.days; i++) {
      const day = addDays(input.from, i);
      if (!isWorkingDay(day) || day.getTime() < todayUtc().getTime()) continue;
      const key = isoDate(day);
      const slots = [];
      for (const s of input.slots) {
        if (slotHasPassed(day, s)) continue;
        const hits = busy.filter((b) => isoDate(b.date) === key && b.timeSlot === s.slot);
        const judgeBusy = hits.some((b) => b.judgeId === input.judgeId);
        const lawyerBusy = hits.some((b) =>
          b.case.parties.some((p) => p.lawyerId && lawyers.has(p.lawyerId)),
        );
        if (judgeBusy || lawyerBusy) continue;
        const takenRooms = new Set(hits.map((b) => b.courtroomId));
        const free = rooms.filter((r) => !takenRooms.has(r.id));
        if (free.length > 0) slots.push({ ...s, courtrooms: free });
      }
      if (slots.length > 0) result.push({ date: key, slots });
    }
    return result;
  }
}
