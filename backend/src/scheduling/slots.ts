import { BadRequestException } from '@nestjs/common';
import { Messages } from '../common/messages';
import type { SchedulePolicy } from '../settings/settings.service';

export interface Slot {
  slot: number;
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const fromMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Consecutive blocks inside court hours, numbered from 1. */
export function buildSlots(policy: SchedulePolicy): Slot[] {
  const start = toMinutes(policy.courtDayStart);
  const end = toMinutes(policy.courtDayEnd);
  const slots: Slot[] = [];
  for (
    let m = start, n = 1;
    m + policy.hearingSlotMinutes <= end;
    m += policy.hearingSlotMinutes, n++
  ) {
    slots.push({ slot: n, start: fromMinutes(m), end: fromMinutes(m + policy.hearingSlotMinutes) });
  }
  return slots;
}

/** Strict YYYY-MM-DD to a UTC midnight Date (as stored in @db.Date columns), or null. */
export function parseDate(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function requireDate(value: string | undefined | null, field = 'date'): Date {
  const d = parseDate(value);
  if (!d) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: Messages.INVALID_FIELDS,
      details: [{ field, messages: ['Enter a valid date (YYYY-MM-DD).'] }],
    });
  }
  return d;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

/** Monday to Friday. */
export const isWorkingDay = (d: Date) => {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
};

export function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const weekdayOf = (d: Date) => WEEKDAYS[d.getUTCDay()];

/** DD-MM-YYYY for messages. */
export const ddmmyyyy = (d: Date) => {
  const s = isoDate(d);
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
};

/** Key for pg_advisory_xact_lock: one lock per calendar day. */
export const dayLockKey = (d: Date) => Math.floor(d.getTime() / DAY_MS);

function bad(field: string, text: string) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: Messages.INVALID_FIELDS,
    details: [{ field, messages: [text] }],
  });
}

/** Hearings only on a working day, today or later, in a real slot of the day. */
export function assertBookable(date: Date, slot: number, slots: Slot[]) {
  if (!isWorkingDay(date)) throw bad('date', 'Hearings can only be scheduled Monday to Friday.');
  if (date.getTime() < todayUtc().getTime()) throw bad('date', 'Choose today or a later date.');
  if (!slots.some((s) => s.slot === slot)) {
    throw bad('slot', 'Choose a time slot within court hours.');
  }
}
