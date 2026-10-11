/** Recently opened cases and pages for the command palette: the last 5, per user, in localStorage. */
export interface RecentItem {
  kind: 'case' | 'page';
  /** Route to open. */
  path: string;
  /** UCN for a case; the English label key for a page. */
  label: string;
  /** Case title (cases only). */
  detail?: string;
}

const MAX = 5;
const key = (userId: string) => `da_recent_${userId}`;

export function readRecent(userId: string): RecentItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(raw) ? (raw as RecentItem[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordRecent(userId: string, item: RecentItem) {
  try {
    const next = [item, ...readRecent(userId).filter((r) => r.path !== item.path)].slice(0, MAX);
    localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    // storage unavailable: no recent list
  }
}
