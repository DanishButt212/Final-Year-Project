import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AxiosError } from 'axios';
import { vi } from 'vitest';
import { api } from '@/lib/api';
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

export interface MockRequest {
  method: string;
  url: string;
  data: unknown;
  params?: Record<string, unknown>;
}
export type MockResponse = { status?: number; data?: unknown };

/**
 * Replaces Axios' network adapter, so tests exercise the real API client (URLs, interceptors,
 * error parsing) without a server. Returns a function that restores the original adapter.
 * Responses with status >= 400 reject exactly like a real failed request.
 */
export function mockApi(handler: (req: MockRequest) => MockResponse | Promise<MockResponse>) {
  const original = api.defaults.adapter;
  const calls: MockRequest[] = [];
  api.defaults.adapter = async (config) => {
    const req: MockRequest = {
      method: (config.method ?? 'get').toLowerCase(),
      url: config.url ?? '',
      data: config.data,
      params: config.params,
    };
    // Public settings are read by every filing gate; answer them here so tests only see their own calls.
    const res =
      req.method === 'get' && req.url === '/settings/public'
        ? { data: { maxAttachmentMb: 25, caseRegistrationOpen: true } }
        : (calls.push(req), await handler(req));
    const status = res.status ?? 200;
    const response = {
      data: res.data,
      status,
      statusText: String(status),
      headers: {},
      config,
      request: {},
    };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        'ERR_BAD_REQUEST',
        config,
        undefined,
        response,
      );
    }
    return response;
  };
  return Object.assign(
    () => {
      api.defaults.adapter = original;
    },
    { calls },
  );
}
