/** One bar or point: the short axis label, the full label (tooltip, table) and the value as shown. */
export interface ChartRow {
  key: string;
  label: string;
  full: string;
  value: number | null;
  display: string;
  color?: string;
}
