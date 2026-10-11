/**
 * "Add to calendar" for hearings: a Google Calendar link and an iCalendar (.ics) file, both built in the browser
 * from data the user can already see (no extra endpoint, so access control is unchanged). Hearing times are
 * Pakistan wall-clock times (UTC+05:00, no daylight saving).
 */
export interface CalendarHearing {
  id: string;
  ucn: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, Pakistan time */
  startTime: string | null;
  endTime?: string | null;
  courtroom?: string | null;
  court?: string | null;
  isVirtual?: boolean;
  /** Absolute link back to the case page. */
  caseUrl: string;
  /** Translated texts: "Hearing: DA-...", the details line. */
  title: string;
  details: string;
}

const PK_OFFSET_MIN = 5 * 60;
const DEFAULT_MINUTES = 30;
const pad = (n: number) => String(n).padStart(2, '0');

function wallClock(date: string, hhmm: string | null | undefined, fallbackMinutes = 9 * 60) {
  const [y, m, d] = date.split('-').map(Number);
  const minutes =
    hhmm && /^\d{2}:\d{2}$/.test(hhmm)
      ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
      : fallbackMinutes;
  return { y, m, d, minutes };
}

/** Pakistan wall-clock time -> UTC instant. */
function toUtc(date: string, hhmm: string | null | undefined, addMinutes = 0) {
  const w = wallClock(date, hhmm);
  return new Date(Date.UTC(w.y, w.m - 1, w.d, 0, w.minutes - PK_OFFSET_MIN + addMinutes));
}

const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Local (TZID) stamp, e.g. 20261014T103000. */
function localStamp(date: string, hhmm: string | null | undefined, addMinutes = 0) {
  const t = toUtc(date, hhmm, addMinutes + PK_OFFSET_MIN);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
}

function endFor(h: CalendarHearing): { hhmm: string | null | undefined; add: number } {
  return h.endTime ? { hhmm: h.endTime, add: 0 } : { hhmm: h.startTime, add: DEFAULT_MINUTES };
}

export function locationOf(h: CalendarHearing): string {
  return [h.courtroom, h.court].filter(Boolean).join(', ');
}

/** https://calendar.google.com/calendar/render?action=TEMPLATE with UTC start and end. */
export function googleCalendarUrl(h: CalendarHearing): string {
  const end = endFor(h);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: h.title,
    dates: `${utcStamp(toUtc(h.date, h.startTime))}/${utcStamp(toUtc(h.date, end.hhmm, end.add))}`,
    details: `${h.details}\n${h.caseUrl}`,
    location: locationOf(h),
    ctz: 'Asia/Karachi',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 text escaping. */
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 octets (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/** A complete VCALENDAR with one VEVENT in Asia/Karachi time and a reminder one day before. */
export function buildIcs(h: CalendarHearing, now: Date = new Date()): string {
  const end = endFor(h);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DigitalAdaalat//Hearings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Karachi',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0500',
    'TZOFFSETTO:+0500',
    'TZNAME:PKT',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    // i18n-ignore (iCalendar protocol line)
    `UID:hearing-${h.id}-${h.date}@digitaladaalat`,
    `DTSTAMP:${utcStamp(now)}`,
    // i18n-ignore (iCalendar protocol line)
    `DTSTART;TZID=Asia/Karachi:${localStamp(h.date, h.startTime)}`,
    // i18n-ignore (iCalendar protocol line)
    `DTEND;TZID=Asia/Karachi:${localStamp(h.date, end.hhmm, end.add)}`,
    `SUMMARY:${esc(h.title)}`,
    `LOCATION:${esc(locationOf(h))}`,
    `DESCRIPTION:${esc(`${h.details}\n${h.caseUrl}`)}`,
    `URL:${h.caseUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(h.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Saves the .ics file (hearing-<UCN>-<date>.ics). */
export function downloadIcs(h: CalendarHearing) {
  // i18n-ignore (media type)
  const blob = new Blob([buildIcs(h)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hearing-${h.ucn}-${h.date}.ics`; // i18n-ignore (file name)
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
