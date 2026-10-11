import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { usersApi } from '@/lib/auth-api';
import { readStoredLanguage } from '@/i18n';
import { hasStoredFontScale, isFontScale, usePreferences } from './preferences';

/**
 * Keeps language and text size on the signed-in account. At sign-in, a choice already made in this browser
 * (for example on the login page) wins and is saved to the account; on a browser without one (a new device)
 * the account's choice is applied, so it follows the user across devices. Later changes are saved with
 * PATCH /users/me. Renders nothing.
 */
export function PreferenceSync() {
  const { user, setUser } = useAuth();
  const { language, fontScale, setLanguage, setFontScale } = usePreferences();
  const appliedFor = useRef<string | null>(null);
  /** Values taken from the account at sign-in that have not reached local state yet. */
  const pending = useRef<{ lang?: string; scale?: number } | null>(null);

  // Sign-in (or a different account).
  useEffect(() => {
    if (!user) {
      appliedFor.current = null;
      return;
    }
    if (appliedFor.current === user.id) return;
    appliedFor.current = user.id;
    // A local choice is the most recent explicit one: keep it (the effect below saves it to the account).
    const lang = readStoredLanguage() ? undefined : user.preferredLanguage;
    const scale = !hasStoredFontScale() && isFontScale(user.fontScale) ? user.fontScale : undefined;
    const next: { lang?: string; scale?: number } = {};
    if (lang && lang !== language) {
      next.lang = lang;
      setLanguage(lang);
    }
    if (scale !== undefined && scale !== fontScale) {
      next.scale = scale;
      setFontScale(scale);
    }
    pending.current = next.lang || next.scale !== undefined ? next : null;
    // Only on account change; later changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // A change made while signed in is saved to the account (quietly; a failure keeps the local choice).
  useEffect(() => {
    if (!user || appliedFor.current !== user.id) return;
    const p = pending.current;
    if (p) {
      // Wait for the sign-in values to arrive instead of saving this browser's old choice over them.
      if ((p.lang && p.lang !== language) || (p.scale !== undefined && p.scale !== fontScale))
        return;
      pending.current = null;
    }
    if (user.preferredLanguage === language && user.fontScale === fontScale) return;
    let cancelled = false;
    usersApi
      .updateMe({ preferredLanguage: language, fontScale })
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [language, fontScale, user, setUser]);

  return null;
}
