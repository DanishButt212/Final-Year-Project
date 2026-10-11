import i18n from '@/i18n';

/** Intl locale for month and weekday names; Western digits in both languages. */
const locale = () => (i18n.language === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB');
const atUtcNoon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** "Oct" / "اکتوبر" for a YYYY-MM month. */
export const monthShort = (ym: string) =>
  new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' }).format(
    atUtcNoon(`${ym}-15`),
  );

/** "October 2026" for a YYYY-MM month. */
export const monthLong = (ym: string) =>
  new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    atUtcNoon(`${ym}-15`),
  );

/** "12-10" (DD-MM) for a YYYY-MM-DD date. */
export const dayShort = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/** "Monday" for a YYYY-MM-DD date. */
export const weekdayLong = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(atUtcNoon(iso));
