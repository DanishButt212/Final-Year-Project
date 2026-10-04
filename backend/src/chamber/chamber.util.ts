import { Prisma } from '../generated/prisma/client';

export const KARACHI_TZ = 'Asia/Karachi';

/** Calendar date (YYYY-MM-DD) in Pakistan time. */
export const karachiDate = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: KARACHI_TZ }).format(d);

/** A YYYY-MM-DD string as the UTC-midnight Date that @db.Date columns use. */
export const dateOnly = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** First day (YYYY-MM-DD) of the month of a YYYY-MM-DD date. */
export const monthStart = (s: string): string => `${s.slice(0, 7)}-01`;

/** 12345-1234567-1 becomes 12345-*******-1. */
export const maskCnic = (cnic: string | null): string | null =>
  cnic ? `${cnic.slice(0, 5)}-*******-${cnic.slice(-1)}` : null;

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const dec = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
export const money = (v: Prisma.Decimal) => v.toFixed(2);

export type RetainerStatus = 'OK' | 'LOW' | 'OVERDRAWN';
export function retainerStatus(balance: Prisma.Decimal, threshold: Prisma.Decimal): RetainerStatus {
  if (balance.isNegative()) return 'OVERDRAWN';
  return balance.lessThan(threshold) ? 'LOW' : 'OK';
}
