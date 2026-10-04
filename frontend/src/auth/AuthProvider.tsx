import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { toast } from '@/components/ui/toaster';
import { setUnauthorizedHandler } from '@/lib/api';
import { authApi } from '@/lib/auth-api';
import type { User } from '@/lib/types';
import { AuthContext, type AuthState } from './context';

const ME_KEY = ['auth', 'me'];

/**
 * Holds the signed-in user. The session itself lives in an httpOnly cookie, so the only way to know
 * who is signed in is to ask the API (GET /auth/me); nothing sensitive is kept in browser storage.
 */
/** Mark the user signed out and drop every other cached query. The session entry is kept (not cleared) so the provider's subscription sees the change. */
function endSession(queryClient: QueryClient) {
  queryClient.setQueryData(ME_KEY, null);
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch {
        return null; // not signed in (or API unreachable): treat as a guest
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // A protected call returned 401: the session ended, so drop the user and let route guards redirect.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (queryClient.getQueryData(ME_KEY)) {
        endSession(queryClient);
        toast.info('Your session has ended. Please log in again.');
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const login = useCallback<AuthState['login']>(
    async (identifier, password, chamberCode) => {
      const result = await authApi.login(identifier, password, chamberCode);
      queryClient.setQueryData(ME_KEY, result.user);
      return result;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      endSession(queryClient);
    }
  }, [queryClient]);

  const setUser = useCallback(
    (user: User) => queryClient.setQueryData(ME_KEY, user),
    [queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({ user: data ?? null, loading: isPending, login, logout, setUser }),
    [data, isPending, login, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
