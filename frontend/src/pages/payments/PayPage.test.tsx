import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayPage from './PayPage';
import { makeAuth, mockApi, renderPage, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/viewer/PreviewButton', () => ({ PreviewButton: () => null }));
let restore: (() => void) | undefined;
afterEach(() => restore?.());
const render = () =>
  renderPage(<PayPage />, {
    auth: makeAuth({ user: sampleUser() }),
    path: '/litigant/pay/:challanId',
    route: '/litigant/pay/c1',
  });

describe.each([
  ['MOCK_JAZZCASH', 'JazzCash'],
  ['MOCK_EASYPAISA', 'Easypaisa'],
] as const)('%s checkout', (method, label) => {
  it('submits wallet details without card fields and shows the receipt', async () => {
    let submitted: unknown;
    restore = mockApi((req) => {
      if (req.url === '/payments/checkout')
        return { data: { paymentId: 'p1', challanNo: 'CH-2026-000001', amount: '100.00' } };
      if (req.url === '/mock-gateway/authorize') {
        submitted = typeof req.data === 'string' ? JSON.parse(req.data) : req.data;
        return {
          data: {
            paymentId: 'p1',
            receiptNo: 'RCPT-2026-000001',
            amount: '100.00',
            paidAt: '2026-11-16T10:00:00Z',
          },
        };
      }
      return { data: {} };
    });
    render();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(/payment method/i), method);
    expect(screen.queryByLabelText(/cardholder name/i)).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText(new RegExp(`${label} mobile number`, 'i')),
      '03000000000',
    );
    await user.click(screen.getByRole('button', { name: /^Pay PKR/i }));
    await waitFor(() =>
      expect(submitted).toEqual({
        paymentId: 'p1',
        method,
        mobileNumber: '03000000000',
      }),
    );
    expect(await screen.findByText('RCPT-2026-000001')).toBeInTheDocument();
  });

  it('blocks incomplete wallet details and allows switching back to card', async () => {
    const authorize = vi.fn();
    restore = mockApi((req) => {
      if (req.url === '/payments/checkout')
        return { data: { paymentId: 'p1', challanNo: 'CH-2026-000001', amount: '100.00' } };
      authorize();
      return { data: {} };
    });
    render();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(/payment method/i), method);
    await user.click(screen.getByRole('button', { name: /^Pay PKR/i }));
    expect(
      await screen.findByText('Enter an 11 digit wallet mobile number starting with 03.'),
    ).toBeInTheDocument();
    expect(authorize).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText(/payment method/i), 'MOCK_CARD');
    expect(screen.getByLabelText(/cardholder name/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(new RegExp(`${label} mobile number`, 'i')),
    ).not.toBeInTheDocument();
  });
});

describe('Bank transfer checkout', () => {
  it('submits the demo reference and displays the receipt', async () => {
    let submitted: unknown;
    restore = mockApi((req) => {
      if (req.url === '/payments/checkout')
        return { data: { paymentId: 'p1', challanNo: 'CH-2026-000001', amount: '100.00' } };
      if (req.url === '/mock-gateway/authorize') {
        submitted = typeof req.data === 'string' ? JSON.parse(req.data) : req.data;
        return {
          data: {
            paymentId: 'p1',
            receiptNo: 'RCPT-2026-000001',
            amount: '100.00',
            paidAt: '2026-11-16T10:00:00Z',
          },
        };
      }
      return { data: {} };
    });
    render();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(/payment method/i), 'MOCK_BANK_TRANSFER');
    expect(screen.queryByLabelText(/cardholder name|mobile number/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/transfer reference/i), 'demo-bank-approved');
    await user.click(screen.getByRole('button', { name: /^Pay PKR/i }));
    await waitFor(() =>
      expect(submitted).toEqual({
        paymentId: 'p1',
        method: 'MOCK_BANK_TRANSFER',
        transferReference: 'DEMO-BANK-APPROVED',
      }),
    );
    expect(await screen.findByText('RCPT-2026-000001')).toBeInTheDocument();
  });
  it('blocks missing references before contacting the gateway', async () => {
    const authorize = vi.fn();
    restore = mockApi((req) => {
      if (req.url === '/payments/checkout')
        return { data: { paymentId: 'p1', challanNo: 'CH-2026-000001', amount: '100.00' } };
      authorize();
      return { data: {} };
    });
    render();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(/payment method/i), 'MOCK_BANK_TRANSFER');
    await user.click(screen.getByRole('button', { name: /^Pay PKR/i }));
    expect(
      await screen.findByText(
        'Enter a bank transfer reference (6 to 40 uppercase letters, digits or hyphens).',
      ),
    ).toBeInTheDocument();
    expect(authorize).not.toHaveBeenCalled();
  });
});
