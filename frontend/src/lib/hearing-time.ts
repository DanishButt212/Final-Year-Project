import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { formatDate, ltr } from './format';
import { pkIsoDate, pkMinutes } from './pk-time';

/** The current time, refreshed every minute (no refetching; used for live countdowns). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;

/**
 * Relative wording for a hearing in the reader's language, in Pakistan time:
 * "Today at 10:30 · in 45 minutes", "Tomorrow at 10:30", "In 3 days · 14-10-2026, 10:30".
 */
export function relativeHearing(
  date: string,
  startTime: string | null | undefined,
  now: Date,
  t: TFunction,
): string {
  const days = dayNumber(date) - dayNumber(pkIsoDate(now));
  const time = startTime ? ltr(startTime) : null;
  if (days === 0) {
    if (!startTime) return t('Today');
    const diff =
      Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) - pkMinutes(now);
    if (diff > 59) {
      const hours = Math.floor(diff / 60);
      const minutes = diff % 60;
      return minutes
        ? t('Today at {{time}} · in {{hours}} h {{minutes}} min', { time, hours, minutes })
        : t('Today at {{time}} · in {{hours}} h', { time, hours });
    }
    if (diff > 0) {
      return diff === 1
        ? t('Today at {{time}} · in 1 minute', { time })
        : t('Today at {{time}} · in {{count}} minutes', { time, count: diff });
    }
    return t('Today at {{time}} · now', { time });
  }
  if (days === 1) return time ? t('Tomorrow at {{time}}', { time }) : t('Tomorrow');
  if (days > 1) {
    const when = time ? `${formatDate(date)}, ${time}` : formatDate(date);
    return t('In {{count}} days · {{when}}', { count: days, when });
  }
  return time ? `${formatDate(date)}, ${time}` : formatDate(date);
}
