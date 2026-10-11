import { createContext, useContext } from 'react';
import i18n, { changeLanguage, type Language } from '@/i18n';

/** Root font-size steps: 100 %, 112.5 % and 125 %. Every rem-based style scales with them. */
export const FONT_SCALES = [1, 1.125, 1.25] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const FONT_STORAGE_KEY = 'da_font_scale';

export const isFontScale = (v: unknown): v is FontScale =>
  typeof v === 'number' && (FONT_SCALES as readonly number[]).includes(v);

export interface PreferencesState {
  language: Language;
  fontScale: FontScale;
  setLanguage: (lng: Language) => void;
  setFontScale: (scale: FontScale) => void;
}

export const PreferencesContext = createContext<PreferencesState | null>(null);

/** Outside a provider (isolated component tests) the controls still work, without persistence. */
const standalone: PreferencesState = {
  get language() {
    return i18n.language === 'ur' ? 'ur' : 'en';
  },
  fontScale: 1,
  setLanguage: (lng) => void changeLanguage(lng),
  setFontScale: (scale) => applyFontScale(scale),
};

export function usePreferences(): PreferencesState {
  return useContext(PreferencesContext) ?? standalone;
}

export function readStoredFontScale(): FontScale {
  try {
    const v = Number(localStorage.getItem(FONT_STORAGE_KEY));
    return isFontScale(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function storeFontScale(scale: FontScale) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(scale));
  } catch {
    // storage unavailable
  }
}

/** Sets --da-font-scale on <html>; index.css multiplies the root size by it (and by 1.1 for Urdu). */
export function applyFontScale(scale: FontScale) {
  document.documentElement.style.setProperty('--da-font-scale', String(scale));
}
