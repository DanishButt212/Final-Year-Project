/** Pakistan time (Asia/Karachi) regardless of the browser's time zone; mirrors backend/src/common/pk-time.ts. */
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Two-digit wall-clock parts of an instant in Pakistan. */
export function pkParts(d: Date = new Date()) {
  const parts = formatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** YYYY-MM-DD in Pakistan. */
export const pkIsoDate = (d: Date = new Date()) => {
  const p = pkParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Minutes since midnight in Pakistan. */
export const pkMinutes = (d: Date = new Date()) => {
  const p = pkParts(d);
  return Number(p.hour) * 60 + Number(p.minute);
};
