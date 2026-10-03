import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AuthContext, type AuthState } from '@/auth/context';
import type { User } from '@/lib/types';

export const sampleUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  role: 'LITIGANT',
  firstName: 'Ayesha',
  lastName: 'Siddiqui',
  email: 'ayesha@example.test',
  username: null,
  cnic: '36302-1111111-1',
  phone: '+92 300 1111111',
  profileImage: null,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

export function makeAuth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    user: null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
    ...overrides,
  };
}

/** Shows where the router ended up, so tests can assert on navigation. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

export function renderPage(
  ui: ReactElement,
  opts: { auth?: AuthState; route?: string; path?: string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={opts.auth ?? makeAuth()}>
        <MemoryRouter initialEntries={[opts.route ?? opts.path ?? '/']}>
          <Routes>
            <Route path={opts.path ?? '/'} element={ui} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
