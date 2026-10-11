import { useContext } from 'react';
import { AuthContext, type AuthState } from './context';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  // i18n-ignore
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
