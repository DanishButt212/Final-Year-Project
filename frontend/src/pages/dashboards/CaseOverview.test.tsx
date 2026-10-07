import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CaseOverview from './CaseOverview';
import { makeAuth, mockApi, renderPage, sampleUser } from '@/test/utils';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

const recent = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    ucn: `DA-2026-CIV-00000${i + 1}`,
    title: `Case ${i + 1}`,
    caseType: 'CIVIL_SUIT',
    status: i === 0 ? 'HEARING_FIXED' : 'PENDING_ASSIGNMENT',
    filingDate: '2026-10-03T00:00:00.000Z',
    createdAt: '2026-10-03T00:00:00.000Z',
    court: null,
    courtroom: null,
    judge: null,
  }));

const render = (role: 'LITIGANT' | 'LAWYER' = 'LITIGANT') =>
  renderPage(<CaseOverview />, {
    auth: makeAuth({
      user: sampleUser({
        role,
        // Only verified lawyers may file (Phase 3A).
        ...(role === 'LAWYER'
          ? { lawyerProfile: { barNumber: 'LH-1234', verificationStatus: 'VERIFIED' as const } }
          : {}),
      }),
    }),
  });

describe('CaseOverview (dashboard)', () => {
  it('shows real totals, the recent cases and a clear New Case Submission button', async () => {
    restore = mockApi(() => ({ data: { total: 7, pendingAssignment: 6, recent: recent(5) } }));
    render();

    expect(await screen.findByTestId('stat-Total cases')).toHaveTextContent('7');
    expect(screen.getByTestId('stat-Pending assignment')).toHaveTextContent('6');
    expect(screen.getByRole('link', { name: /new case submission/i })).toHaveAttribute(
      'href',
      '/litigant/new-case',
    );

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('link')).toHaveLength(5);
    expect(within(list).getByText('DA-2026-CIV-000001')).toHaveClass('case-number');
    expect(within(list).getByText('Hearing Fixed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/litigant/cases',
    );
  });

  it('uses the lawyer portal paths for lawyers', async () => {
    restore = mockApi(() => ({ data: { total: 1, pendingAssignment: 1, recent: recent(1) } }));
    render('LAWYER');
    expect(await screen.findByRole('link', { name: /new case submission/i })).toHaveAttribute(
      'href',
      '/lawyer/new-case',
    );
    expect(await screen.findByRole('link', { name: /Case 1/ })).toHaveAttribute(
      'href',
      '/lawyer/cases/c0',
    );
  });

  it('shows the exact empty state when there are no cases', async () => {
    restore = mockApi(() => ({ data: { total: 0, pendingAssignment: 0, recent: [] } }));
    render();
    expect(
      await screen.findByText('No active or past legal cases found in your portfolio.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('stat-Total cases')).toHaveTextContent('0');
  });

  it('shows skeletons while loading', () => {
    restore = mockApi(() => new Promise(() => undefined));
    render();
    expect(screen.getByRole('status', { name: /loading cases/i })).toBeInTheDocument();
  });

  it('shows the error when the summary cannot be loaded', async () => {
    restore = mockApi(() => ({
      status: 500,
      data: {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again later.',
      },
    }));
    render();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
