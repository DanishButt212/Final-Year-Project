import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthContext } from '@/auth/context';
import type { Role } from '@/lib/types';
import { makeAuth, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));
vi.mock('@/lib/auth-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-api')>();
  return {
    ...original,
    usersApi: {
      ...original.usersApi,
      list: vi.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }),
    },
  };
});

function renderApp(route: string, role?: Role) {
  const auth = makeAuth({ user: role ? sampleUser({ role }) : null });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const HOME: Record<Role, { path: string; heading: RegExp; portal: string }> = {
  LITIGANT: { path: '/litigant', heading: /welcome, ayesha siddiqui/i, portal: 'Litigant Portal' },
  LAWYER: { path: '/lawyer', heading: /welcome, ayesha siddiqui/i, portal: 'Lawyer Chamber' },
  INTERN: { path: '/intern', heading: /welcome, ayesha siddiqui/i, portal: 'Legal Intern Portal' },
  JUDGE: { path: '/judge', heading: /welcome, ayesha siddiqui/i, portal: 'Judge Portal' },
  ADMIN: { path: '/admin', heading: /welcome, ayesha siddiqui/i, portal: 'Administration' },
  PROCESS_SERVER: {
    path: '/process-server',
    heading: /^process server$/i,
    portal: 'Process Server',
  },
};

describe('role-based routing', () => {
  it.each(Object.entries(HOME))(
    '%s lands on its own dashboard after login',
    async (role, expected) => {
      // A signed-in user opening /login is redirected to their dashboard.
      renderApp('/login', role as Role);
      expect(
        await screen.findByRole('heading', { level: 1, name: expected.heading }),
      ).toBeInTheDocument();
      expect(screen.getAllByText(expected.portal).length).toBeGreaterThan(0);
      expect(screen.getByRole('navigation', { name: /portal navigation/i })).toBeInTheDocument();
    },
  );

  it('shows the admin user table (empty state) only on the admin dashboard', async () => {
    renderApp('/admin', 'ADMIN');
    expect(await screen.findByText('No users found')).toBeInTheDocument();
  });

  it.each([
    ['LITIGANT', '/admin'],
    ['LAWYER', '/judge'],
    ['JUDGE', '/admin/audit-logs'],
    ['INTERN', '/litigant/file-case'],
  ] as const)('%s opening %s is shown the 403 page', async (role, path) => {
    renderApp(path, role);
    expect(await screen.findByText(/403: you do not have access/i)).toBeInTheDocument();
  });

  it('sends guests from a protected page to the login page', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: /log in/i })).toBeInTheDocument();
  });

  it('shows a clear "coming in a later phase" page for sidebar items', async () => {
    renderApp('/litigant/file-case', 'LITIGANT');
    expect(await screen.findByText('Coming in a later phase')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'File a Case' })).toBeInTheDocument();
  });

  it('shows the 404 page for unknown routes, for guests and signed-in users', async () => {
    const { unmount } = renderApp('/definitely/not/here');
    expect(await screen.findByText(/404: page not found/i)).toBeInTheDocument();
    unmount();
    renderApp('/nothing-here/at/all/really', 'JUDGE');
    expect(await screen.findByText(/404: page not found/i)).toBeInTheDocument();
  });

  it('keeps guests on the landing page, with Login and Register actions', () => {
    renderApp('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /welcome to digitaladaalat/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /register/i }).length).toBeGreaterThan(0);
  });
});
