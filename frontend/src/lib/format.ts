import { pkParts } from './pk-time';

/** Dates are shown as DD-MM-YYYY (Pakistan time) and money as PKR, as required by the project brief. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const p = pkParts(d);
  return `${p.day}-${p.month}-${p.year}`;
}

export function formatPkr(amount: number | string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** DD-MM-YYYY HH:mm (24-hour, Pakistan time). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const p = pkParts(d);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** 512 -> "512 B", 2048 -> "2 KB", 5 242 880 -> "5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}
