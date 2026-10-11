/** Local part as typed/shown after the fixed "+92": "3XX XXXXXXX" (partial while typing). */
export function toLocalPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('92') && d.length > 10) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

/** Stored format "+92 3XX XXXXXXX" ("" when empty), the same format the API has always used. */
export const toStoredPhone = (local: string) => (local ? `+92 ${local}` : '');
