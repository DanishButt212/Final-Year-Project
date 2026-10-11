import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, readStoredLanguage, storeLanguage, type Language } from '@/i18n';
import {
  applyFontScale,
  PreferencesContext,
  readStoredFontScale,
  storeFontScale,
  type FontScale,
  type PreferencesState,
} from './preferences';

/**
 * Language and text size. Guests keep them in localStorage; signed-in users also on their account
 * (see usePreferenceSync), so the choice follows them across devices. Switching never reloads the page.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<Language>(() =>
    i18n.language === 'ur' ? 'ur' : (readStoredLanguage() ?? 'en'),
  );
  const [fontScale, setFontScaleState] = useState<FontScale>(readStoredFontScale);

  useEffect(() => {
    void changeLanguage(language);
  }, [language]);

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  const setLanguage = useCallback((lng: Language) => {
    storeLanguage(lng);
    setLanguageState(lng);
  }, []);

  const setFontScale = useCallback((scale: FontScale) => {
    storeFontScale(scale);
    setFontScaleState(scale);
  }, []);

  const value = useMemo<PreferencesState>(
    () => ({ language, fontScale, setLanguage, setFontScale }),
    [language, fontScale, setLanguage, setFontScale],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
