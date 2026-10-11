/** "YYYY-MM-DD" (what the API uses) to "DD-MM-YYYY" (what people see and type). */
export const isoToDisplay = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
    : '';

/** "DD-MM-YYYY" (or D-M-YYYY, with - / or .) to "YYYY-MM-DD"; null when it is not a real date. */
export function displayToIso(text: string): string | null {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}
