/**
 * Pakistan time (Asia/Karachi, UTC+05:00, no daylight saving) independent of the machine's time zone.
 * Hearing slots, the virtual courtroom window and "today" are always evaluated with these helpers, so the API
 * behaves the same on a laptop in Pakistan and on a UTC server. TZ=Asia/Karachi is still set in deployment as a
 * second line of defence for libraries that format local time.
 */
export const PK_TZ = 'Asia/Karachi';
const PK_OFFSET = '+05:00';

const pad = (n: number) => String(n).padStart(2, '0');

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock parts of an instant in Pakistan. */
export function pkParts(d: Date = new Date()) {
  const parts = partsFormatter.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Today's (or the instant's) calendar date in Pakistan, YYYY-MM-DD. */
export function pkIsoDate(d: Date = new Date()): string {
  const p = pkParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The Pakistan calendar date as the UTC-midnight Date that @db.Date columns store. */
export function pkToday(d: Date = new Date()): Date {
  return new Date(`${pkIsoDate(d)}T00:00:00.000Z`);
}

/** Minutes since midnight, Pakistan time. */
export function pkMinutesNow(d: Date = new Date()): number {
  const p = pkParts(d);
  return p.hour * 60 + p.minute;
}

/** The instant of a calendar date (stored as UTC midnight) at HH:mm Pakistan time. */
export function pkAt(date: Date, hhmm: string): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T${hhmm.slice(0, 5)}:00${PK_OFFSET}`);
}

/** HH:mm in Pakistan time. */
export function pkHhmm(d: Date): string {
  const p = pkParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** DD-MM-YYYY in Pakistan time. */
export function pkDdMmYyyy(d: Date): string {
  const p = pkParts(d);
  return `${pad(p.day)}-${pad(p.month)}-${p.year}`;
}

/** DD-MM-YYYY HH:mm in Pakistan time. */
export const pkDateTime = (d: Date) => `${pkDdMmYyyy(d)} ${pkHhmm(d)}`;
