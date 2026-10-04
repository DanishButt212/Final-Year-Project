import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import PortfolioPage from './PortfolioPage';
import type { CaseListItem } from '@/lib/cases-api';
import { makeAuth, mockApi, renderPage, sampleUser } from '@/test/utils';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

const auth = makeAuth({ user: sampleUser({ role: 'LITIGANT' }) });
const render = () =>
  renderPage(<PortfolioPage />, { auth, path: '/litigant/cases', route: '/litigant/cases' });

const item = (over: Partial<CaseListItem> = {}): CaseListItem => ({
  id: 'c1',
  ucn: 'DA-2026-CIV-000045',
  title: 'Muhammad Ali vs. The State',
  caseType: 'CIVIL_SUIT',
  status: 'PENDING_ASSIGNMENT',
  filingDate: '2026-10-03T00:00:00.000Z',
  createdAt: '2026-10-03T08:00:00.000Z',
  court: null,
  courtroom: null,
  judge: null,
  ...over,
});
const page = (data: CaseListItem[], total = data.length, pageNo = 1, totalPages = 1) => ({
  data,
  meta: { page: pageNo, limit: 10, total, totalPages },
});

describe('PortfolioPage', () => {
  it('shows the exact empty state when the user has no cases', async () => {
    restore = mockApi(() => ({ data: page([]) }));
    render();
    expect(
      await screen.findByText('No active or past legal cases found in your portfolio.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new case submission/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows loading skeletons while the list is loading', () => {
    restore = mockApi(() => new Promise(() => undefined));
    render();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('lists cases with a monospace UCN, bench, status badge and DD-MM-YYYY date', async () => {
    restore = mockApi(() => ({
      data: page([
        item(),
        item({
          id: 'c2',
          ucn: 'DA-2026-BAL-000007',
          title: 'Bail for Imran',
          caseType: 'BAIL_APPLICATION',
          status: 'HEARING_FIXED',
          judge: 'Imran Qureshi',
          courtroom: 'Court Room 1',
        }),
        item({ id: 'c3', ucn: 'DA-2026-CRA-000002', status: 'DECIDED' }),
        item({ id: 'c4', ucn: 'DA-2026-WRT-000003', status: 'REJECTED' }),
      ]),
    }));
    render();

    const table = await screen.findByRole('table', { name: /case portfolio/i });
    const ucn = within(table).getByRole('link', { name: 'DA-2026-CIV-000045' });
    expect(ucn).toHaveClass('case-number');
    expect(ucn).toHaveAttribute('href', '/litigant/cases/c1');
    expect(within(table).getAllByText('Not yet assigned').length).toBeGreaterThan(0);
    expect(within(table).getByText('Imran Qureshi · Court Room 1')).toBeInTheDocument();
    expect(within(table).getAllByText('03-10-2026').length).toBe(4);
    for (const label of ['Pending Assignment', 'Hearing Fixed', 'Decided', 'Rejected']) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
    expect(within(table).getAllByText('Civil Suit', { selector: 'td' }).length).toBeGreaterThan(0);
  });

  it('opens a case when its row is clicked', async () => {
    const user = userEvent.setup();
    restore = mockApi(() => ({ data: page([item()]) }));
    render();
    await user.click(await screen.findByText('Muhammad Ali vs. The State'));
    expect(await screen.findByTestId('location')).toHaveTextContent('/litigant/cases/c1');
  });

  it('sends the search text and status filter to the API and resets to page 1', async () => {
    const user = userEvent.setup();
    const mock = mockApi(() => ({ data: page([item()], 25, 1, 3) }));
    restore = mock;
    render();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(mock.calls.at(-1)?.params).toMatchObject({ page: 2, limit: 10 }));

    await user.type(screen.getByLabelText(/search by case number/i), 'DA-2026-CIV');
    await user.selectOptions(screen.getByLabelText(/^status/i), 'HEARING_FIXED');
    await waitFor(() =>
      expect(mock.calls.at(-1)?.params).toMatchObject({ page: 1, status: 'HEARING_FIXED' }),
    );
    await user.click(screen.getByRole('button', { name: /^search/i }));
    await waitFor(() =>
      expect(mock.calls.at(-1)?.params).toMatchObject({
        page: 1,
        search: 'DA-2026-CIV',
        status: 'HEARING_FIXED',
      }),
    );
  });

  it('shows a different message when a search finds nothing', async () => {
    const user = userEvent.setup();
    let empty = false;
    restore = mockApi((req) => ({ data: req.params?.search || empty ? page([]) : page([item()]) }));
    render();
    await screen.findByRole('table');
    empty = true;
    await user.type(screen.getByLabelText(/search by case number/i), 'nothing');
    await user.click(screen.getByRole('button', { name: /^search/i }));
    expect(await screen.findByText('No cases match your search')).toBeInTheDocument();
    expect(
      screen.queryByText('No active or past legal cases found in your portfolio.'),
    ).not.toBeInTheDocument();
  });

  it('shows pagination details', async () => {
    restore = mockApi(() => ({ data: page([item()], 25, 1, 3) }));
    render();
    expect(await screen.findByText(/page 1 of 3 \(25 records\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('shows the API error message when loading fails', async () => {
    restore = mockApi(() => ({
      status: 500,
      data: {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again later.',
      },
    }));
    render();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again later.',
    );
  });
});
