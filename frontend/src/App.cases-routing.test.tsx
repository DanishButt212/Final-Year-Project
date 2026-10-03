import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthContext } from '@/auth/context';
import type { Role } from '@/lib/types';
import { makeAuth, mockApi, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function renderApp(route: string, role: Role) {
  restore = mockApi((req) => {
    if (req.url === '/cases/summary')
      return { data: { total: 0, pendingAssignment: 0, recent: [] } };
    if (req.url === '/cases')
      return { data: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } } };
    return {
      status: 404,
      data: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    };
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={makeAuth({ user: sampleUser({ role }) })}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('case filing routes and sidebar', () => {
  it.each([
    ['LITIGANT', 'litigant'],
    ['LAWYER', 'lawyer'],
  ] as const)(
    '%s sidebar lists Dashboard, New Case Submission and My Case Portfolio',
    async (role, slug) => {
      renderApp(`/${slug}`, role);
      const nav = await screen.findByRole('navigation', { name: /portal navigation/i });
      const links = within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent);
      expect(links.slice(0, 3)).toEqual(['Dashboard', 'New Case Submission', 'My Case Portfolio']);
      expect(within(nav).getByRole('link', { name: 'New Case Submission' })).toHaveAttribute(
        'href',
        `/${slug}/new-case`,
      );
      expect(within(nav).getByRole('link', { name: 'My Case Portfolio' })).toHaveAttribute(
        'href',
        `/${slug}/cases`,
      );
    },
  );

  it.each([
    ['LITIGANT', '/litigant/new-case', /new case submission/i],
    ['LAWYER', '/lawyer/new-case', /new case submission/i],
    ['LITIGANT', '/litigant/cases', /my case portfolio/i],
    ['LAWYER', '/lawyer/cases', /my case portfolio/i],
  ] as const)('%s can open %s', async (role, path, heading) => {
    renderApp(path, role);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('shows the portfolio empty state through the real route', async () => {
    renderApp('/litigant/cases', 'LITIGANT');
    expect(
      await screen.findByText('No active or past legal cases found in your portfolio.'),
    ).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', '/litigant/new-case'],
    ['JUDGE', '/litigant/cases'],
    ['INTERN', '/lawyer/cases/abc'],
    ['LITIGANT', '/lawyer/new-case'],
    ['PROCESS_SERVER', '/litigant/new-case'],
  ] as const)('%s opening %s gets the 403 page', async (role, path) => {
    renderApp(path, role);
    expect(await screen.findByText(/403: you do not have access/i)).toBeInTheDocument();
  });

  it("keeps the judge's own /judge/cases page (Case Status, later phase) instead of the case-filing page", async () => {
    renderApp('/judge/cases', 'JUDGE');
    expect(await screen.findByText('Coming in a later phase')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Case Status' })).toBeInTheDocument();
  });

  it('gives judges no case-filing pages', async () => {
    renderApp('/judge/new-case', 'JUDGE');
    expect(await screen.findByText(/404: page not found/i)).toBeInTheDocument();
  });
});
