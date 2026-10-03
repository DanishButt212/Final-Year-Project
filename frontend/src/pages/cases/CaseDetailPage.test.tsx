import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaseDetailPage from './CaseDetailPage';
import { casesApi, type CaseDetail } from '@/lib/cases-api';
import { makeAuth, mockApi, renderPage, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

let restore: (() => void) | undefined;
afterEach(() => restore?.());

const auth = makeAuth({ user: sampleUser({ role: 'LITIGANT' }) });
const render = () =>
  renderPage(<CaseDetailPage />, {
    auth,
    path: '/litigant/cases/:caseId',
    route: '/litigant/cases/c1',
  });

const detail = (over: Partial<CaseDetail> = {}): CaseDetail => ({
  id: 'c1',
  ucn: 'DA-2026-CIV-000045',
  title: 'Ayesha Siddiqui vs. Bilal Ahmed',
  caseType: 'CIVIL_SUIT',
  status: 'PENDING_ASSIGNMENT',
  reliefSought: 'Recovery of PKR 500,000 under the sale agreement.',
  filingDate: '2026-10-03T00:00:00.000Z',
  createdAt: '2026-10-03T08:00:00.000Z',
  filedBy: 'Ayesha Siddiqui',
  court: null,
  courtroom: null,
  judge: null,
  parties: [
    {
      id: 'p1',
      role: 'PETITIONER',
      name: 'Ayesha Siddiqui',
      cnic: '36302-1111111-1',
      phone: null,
      address: null,
      hasCounsel: false,
    },
    {
      id: 'p2',
      role: 'RESPONDENT',
      name: 'Bilal Ahmed',
      cnic: null,
      phone: '+92 321 7654321',
      address: 'Multan',
      hasCounsel: false,
    },
  ],
  documents: [
    {
      id: 'd1',
      name: 'Petition.pdf',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      sha256: 'a'.repeat(64),
      uploadedAt: '2026-10-03T08:00:00.000Z',
      uploadedBy: 'Ayesha Siddiqui',
    },
  ],
  events: [
    {
      id: 'e1',
      type: 'CASE_SUBMITTED',
      description: 'Case submitted as DA-2026-CIV-000045 and pending assignment to a judge.',
      createdAt: new Date(2026, 9, 3, 9, 5).toISOString(),
      actor: 'Ayesha Siddiqui',
    },
    {
      id: 'e2',
      type: 'DOCUMENT_ATTACHED',
      description: 'Document attached: Petition.pdf',
      createdAt: new Date(2026, 9, 3, 9, 6).toISOString(),
      actor: 'Ayesha Siddiqui',
    },
  ],
  ...over,
});

describe('CaseDetailPage', () => {
  it('shows the UCN in monospace with a status badge in the header', async () => {
    restore = mockApi(() => ({ data: detail() }));
    render();
    const ucn = await screen.findByTestId('case-ucn');
    expect(ucn).toHaveTextContent('DA-2026-CIV-000045');
    expect(ucn).toHaveClass('case-number');
    expect(screen.getAllByText('Pending Assignment').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ayesha Siddiqui vs. Bilal Ahmed' }),
    ).toBeInTheDocument();
  });

  it('Overview tab shows parties, relief sought and "Not yet assigned" bench', async () => {
    restore = mockApi(() => ({ data: detail() }));
    render();
    await screen.findByTestId('case-ucn');
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument();
    expect(
      screen.getByText('Recovery of PKR 500,000 under the sale agreement.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument();
    expect(screen.getByText(/36302-1111111-1/)).toBeInTheDocument();
    expect(screen.getByText('Judge bench').nextSibling).toHaveTextContent('Not yet assigned');
    expect(screen.getByText('03-10-2026')).toBeInTheDocument();
  });

  it('shows the assigned court, judge and courtroom when allocated', async () => {
    restore = mockApi(() => ({
      data: detail({
        status: 'ALLOCATED',
        judge: 'Imran Qureshi',
        courtroom: { id: 'r1', name: 'Court Room 1' },
        court: { id: 'k1', name: 'District & Sessions Court Multan', city: 'Multan' },
      }),
    }));
    render();
    await screen.findByTestId('case-ucn');
    expect(screen.getByText('Imran Qureshi · Court Room 1')).toBeInTheDocument();
    expect(screen.getByText('District & Sessions Court Multan, Multan')).toBeInTheDocument();
  });

  it('Documents tab lists files with name, size, date and a download button', async () => {
    const user = userEvent.setup();
    restore = mockApi(() => ({ data: detail() }));
    const download = vi.spyOn(casesApi, 'download').mockResolvedValue(undefined);
    render();
    await user.click(await screen.findByRole('tab', { name: /documents/i }));

    const table = screen.getByRole('table', { name: 'Documents' });
    expect(within(table).getByText('Petition.pdf')).toBeInTheDocument();
    expect(within(table).getByText('2 KB')).toBeInTheDocument();
    expect(within(table).getByText('03-10-2026')).toBeInTheDocument();
    expect(screen.getByText(/locked to this case number/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download Petition.pdf' }));
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ id: 'd1', name: 'Petition.pdf' }),
      ),
    );
  });

  it('uploads more PDFs and shows "Legal document attached successfully."', async () => {
    const user = userEvent.setup();
    const mock = mockApi((req) =>
      req.method === 'post'
        ? { status: 201, data: { message: 'Legal document attached successfully.', attached: 1 } }
        : { data: detail() },
    );
    restore = mock;
    render();
    await user.click(await screen.findByRole('tab', { name: /documents/i }));

    const attach = screen.getByRole('button', { name: /attach document/i });
    expect(attach).toBeDisabled();
    fireEvent.change(screen.getByTestId('pdf-input'), {
      target: { files: [new File(['%PDF-1.4'], 'Statement.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Statement.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /attach document/i }));

    expect(await screen.findByText('Legal document attached successfully.')).toBeInTheDocument();
    const post = mock.calls.find((c) => c.method === 'post');
    expect(post?.url).toBe('/cases/c1/documents');
    expect((post?.data as FormData).getAll('files')).toHaveLength(1);
  });

  it('rejects a non-PDF in the upload box with the exact message and does not call the API', async () => {
    const user = userEvent.setup();
    const mock = mockApi(() => ({ data: detail() }));
    restore = mock;
    render();
    await user.click(await screen.findByRole('tab', { name: /documents/i }));
    fireEvent.change(screen.getByTestId('pdf-input'), {
      target: { files: [new File(['x'], 'virus.exe', { type: 'application/octet-stream' })] },
    });
    expect(
      await screen.findByText('Only PDF format files under 25MB are allowed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /attach document/i })).toBeDisabled();
    expect(mock.calls.filter((c) => c.method === 'post')).toHaveLength(0);
  });

  it('disables uploads on a closed case', async () => {
    const user = userEvent.setup();
    restore = mockApi(() => ({ data: detail({ status: 'DECIDED' }) }));
    render();
    await user.click(await screen.findByRole('tab', { name: /documents/i }));
    expect(screen.getByText('Documents cannot be attached to a closed case.')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-input')).not.toBeInTheDocument();
  });

  it('Lifecycle tab shows a chronological timeline with DD-MM-YYYY HH:mm', async () => {
    const user = userEvent.setup();
    restore = mockApi(() => ({ data: detail() }));
    render();
    await user.click(await screen.findByRole('tab', { name: 'Lifecycle' }));
    const items = within(screen.getByRole('list', { name: /lifecycle events/i })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Case submitted as DA-2026-CIV-000045');
    expect(items[0]).toHaveTextContent('03-10-2026 09:05');
    expect(items[1]).toHaveTextContent('Document attached: Petition.pdf');
    expect(items[1]).toHaveTextContent('03-10-2026 09:06');
  });

  it('shows the 404 page when the case does not exist (or is not yours)', async () => {
    restore = mockApi(() => ({
      status: 404,
      data: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    }));
    render();
    expect(await screen.findByText(/404: page not found/i)).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    restore = mockApi(() => new Promise(() => undefined));
    render();
    expect(screen.getByRole('status', { name: /loading case/i })).toBeInTheDocument();
  });
});
