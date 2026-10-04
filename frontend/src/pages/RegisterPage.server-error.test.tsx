import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { api } from '@/lib/api';
import { renderPage } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

// This file exercises the real Axios client (only the network adapter is replaced),
// so the API error format and the interceptor are covered end to end.
const originalAdapter = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe('RegisterPage server errors', () => {
  it('shows the duplicate-account message when the API answers 409', async () => {
    const user = userEvent.setup();
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
        data: {
          statusCode: 409,
          code: 'DUPLICATE_IDENTIFIER',
          message: 'This account identifier is already in use. Please choose a different one.',
        },
      });
    };
    renderPage(<RegisterPage />);

    await user.type(screen.getByLabelText(/first name/i), 'Ayesha');
    await user.type(screen.getByLabelText(/last name/i), 'Siddiqui');
    await user.type(screen.getByLabelText(/^cnic/i), '36302-1111111-1');
    await user.type(screen.getByLabelText(/mobile number/i), '+92 300 1111111');
    await user.type(screen.getByLabelText(/email address/i), 'ayesha@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'Passw0rdTest');
    await user.type(screen.getByLabelText(/confirm password/i), 'Passw0rdTest');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account identifier is already in use. Please choose a different one.',
    );
  });
});
