import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { makeAuth, renderPage, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', async () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

function unauthorized() {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {} as never,
    data: { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid username or password.' },
  });
}

describe('LoginPage', () => {
  it('shows the missing-fields message and field errors when submitted empty', async () => {
    const login = vi.fn();
    renderPage(<LoginPage />, { auth: makeAuth({ login }) });

    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Please complete all required fields.')).toBeInTheDocument();
    expect(screen.getAllByText('This field is required.')).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it('labels its inputs for assistive technology', () => {
    renderPage(<LoginPage />);
    expect(screen.getByLabelText(/email or username/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toBeRequired();
  });

  it('logs in with the entered credentials and goes to the role dashboard', async () => {
    const login = vi.fn().mockResolvedValue({
      message: 'Logged into the system successfully.',
      user: sampleUser({ role: 'JUDGE' }),
    });
    renderPage(<LoginPage />, { auth: makeAuth({ login }), path: '/login', route: '/login' });

    await userEvent.type(screen.getByLabelText(/email or username/i), 'judge@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('judge@example.test', 'Secret123'));
    expect(await screen.findByTestId('location')).toHaveTextContent('/judge');
  });

  it('shows the generic failure message for wrong credentials', async () => {
    const login = vi.fn().mockRejectedValue(unauthorized());
    renderPage(<LoginPage />, { auth: makeAuth({ login }) });

    await userEvent.type(screen.getByLabelText(/email or username/i), 'someone@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid username or password.');
  });

  it('can reveal and hide the password', async () => {
    renderPage(<LoginPage />);
    const input = screen.getByLabelText(/^password/i);
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
