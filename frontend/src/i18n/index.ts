import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Translations use natural-language keys: the English text in the source is the key, so English renders
 * without loading any catalogue (and keeps the exact texts from the project report). Urdu lives in
 * src/locales/ur/<namespace>.json and is loaded as its own lazy chunk the first time it is needed.
 * src/locales/en/<namespace>.json is the generated English catalogue (npm run i18n:extract).
 */
export type Language = 'en' | 'ur';
export const LANGUAGES: Language[] = ['en', 'ur'];
export const LANG_STORAGE_KEY = 'da_lang';

export const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'ur';

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  ns: ['translation'],
  defaultNS: 'translation',
  // Natural keys contain ":" and "." (sentences), so neither may split a key.
  nsSeparator: false,
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
  initAsync: false,
});

let urduLoaded: Promise<void> | null = null;

/** Loads every Urdu namespace file (one lazy chunk) into the single runtime namespace. */
export function loadUrdu(): Promise<void> {
  urduLoaded ??= import('@/locales/ur').then(({ default: bundle }) => {
    i18n.addResourceBundle('ur', 'translation', bundle, true, true);
  });
  return urduLoaded;
}

/** Sets <html lang/dir> so the layout mirrors and screen readers switch voice. */
export function applyDocumentLanguage(lng: Language) {
  const html = document.documentElement;
  html.lang = lng;
  html.dir = lng === 'ur' ? 'rtl' : 'ltr';
}

/** Switches language without a reload (Urdu is fetched first if it is not loaded yet). */
export async function changeLanguage(lng: Language) {
  if (lng === 'ur') await loadUrdu();
  await i18n.changeLanguage(lng);
  applyDocumentLanguage(lng);
}

export function readStoredLanguage(): Language | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLanguage(lng: Language) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

/** Marks a constant string for translation without translating it (it is translated where it is shown). */
export const msg = <T extends string>(text: T): T => text;

export default i18n;
