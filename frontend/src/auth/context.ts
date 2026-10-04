import { createContext } from 'react';
import type { User } from '@/lib/types';

export interface AuthState {
  user: User | null;
  /** True while the first /auth/me check is running. */
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ message: string; user: User }>;
  logout: () => Promise<void>;
  /** Replace the cached user (for example after a profile edit). */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthState | null>(null);
