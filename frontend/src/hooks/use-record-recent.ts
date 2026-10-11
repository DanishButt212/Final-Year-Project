import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { recordRecent } from '@/lib/recent';

/** Adds the open case page to the user's recent items (command palette, last 5). */
export function useRecordRecentCase(c: { ucn: string; title: string } | undefined) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (user && c)
      recordRecent(user.id, { kind: 'case', path: pathname, label: c.ucn, detail: c.title });
  }, [user, c, pathname]);
}
