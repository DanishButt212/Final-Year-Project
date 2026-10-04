import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { authApi } from '@/lib/auth-api';
import { renderPage } from '@/test/utils';

vi.mock('@/components/ui/toaster', async () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));
vi.mock('@/lib/auth-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-api')>();
  return { ...original, authApi: { ...original.authApi, register: vi.fn() } };
});

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), 'Ayesha');
  await user.type(screen.getByLabelText(/last name/i), 'Siddiqui');
  await user.type(screen.getByLabelText(/^cnic/i), '36302-1111111-1');
  await user.type(screen.getByLabelText(/mobile number/i), '+92 300 1111111');
  await user.type(screen.getByLabelText(/email address/i), 'ayesha@example.test');
  await user.type(screen.getByLabelText(/^password/i), 'Passw0rdTest');
  await user.type(screen.getByLabelText(/confirm password/i), 'Passw0rdTest');
}

describe('RegisterPage', () => {
  beforeEach(() => vi.mocked(authApi.register).mockReset());

  it('offers Litigant and Lawyer only, defaulting to Litigant', () => {
    renderPage(<RegisterPage />);
    expect(screen.getByRole('radio', { name: /litigant/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /lawyer/i })).not.toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('shows the bar number field only for lawyers', async () => {
    const user = userEvent.setup();
    renderPage(<RegisterPage />);
    expect(screen.queryByLabelText(/bar council number/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /lawyer/i }));
    expect(screen.getByLabelText(/bar council number/i)).toBeInTheDocument();
  });

  it('shows the missing-fields message when submitted empty', async () => {
    renderPage(<RegisterPage />);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Please complete all required fields.')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('validates the CNIC, phone and password-confirmation formats', async () => {
    const user = userEvent.setup();
    renderPage(<RegisterPage />);
    await fillValid(user);
    await user.clear(screen.getByLabelText(/^cnic/i));
    await user.type(screen.getByLabelText(/^cnic/i), '3630211111111');
    await user.clear(screen.getByLabelText(/mobile number/i));
    await user.type(screen.getByLabelText(/mobile number/i), '03001111111');
    await user.clear(screen.getByLabelText(/confirm password/i));
    await user.type(screen.getByLabelText(/confirm password/i), 'Different1Pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('CNIC must be in the format 12345-1234567-1.')).toBeInTheDocument();
    expect(screen.getByText('Phone must be in the format +92 3XX XXXXXXX.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^cnic/i)).toHaveAttribute('aria-invalid', 'true');
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('submits valid data and moves to the login page', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValue({
      message: 'Your registration request has been submitted successfully.',
      user: {} as never,
    });
    renderPage(<RegisterPage />, { path: '/register', route: '/register' });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(1));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'LITIGANT',
        cnic: '36302-1111111-1',
        email: 'ayesha@example.test',
        phone: '+92 300 1111111',
      }),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/login');
  });
});
