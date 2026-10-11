export const FOCUS_KEY = 'da-focus-heading';

/** After login, focus goes to the first page's main heading (not to the toast). Called just before navigating. */
export function requestHeadingFocus() {
  try {
    sessionStorage.setItem(FOCUS_KEY, String(Date.now()));
  } catch {
    // storage unavailable: focus stays where the browser puts it
  }
}

/** Login failed: do not move focus on a later page load. */
export function clearHeadingFocus() {
  try {
    sessionStorage.removeItem(FOCUS_KEY);
  } catch {
    // storage unavailable
  }
}
