import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NewCasePage from './NewCasePage';
import { makeAuth, mockApi, renderPage, sampleUser } from '@/test/utils';

vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

const litigant = makeAuth({ user: sampleUser({ role: 'LITIGANT' }) });
const lawyer = makeAuth({
  user: sampleUser({ role: 'LAWYER', firstName: 'Hamza', lastName: 'Bukhari' }),
});
const RELIEF = 'Recovery of PKR 500,000 under the sale agreement dated 01-01-2026.';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

const setup = (auth = litigant) =>
  renderPage(
    <>
      <a href="/litigant/hearings">Hearings link</a>
      <NewCasePage />
    </>,
    { auth, path: '/litigant/new-case', route: '/litigant/new-case' },
  );

const pdf = (name = 'petition.pdf', size = 2048) => {
  const f = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const chooseFiles = (files: File[]) =>
  fireEvent.change(screen.getByTestId('pdf-input'), { target: { files } });

const currentStep = () =>
  within(screen.getByRole('navigation', { name: 'Progress' }))
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step');

async function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/case type/i), 'CIVIL_SUIT');
  await user.type(screen.getByLabelText(/relief sought/i), RELIEF);
}
async function fillRespondent(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getAllByLabelText(/full name/i)[1], 'Bilal Ahmed');
}
async function toStep(user: ReturnType<typeof userEvent.setup>, n: 2 | 3 | 4) {
  await fillStep1(user);
  await user.click(screen.getByRole('button', { name: /next/i }));
  if (n === 2) return;
  await fillRespondent(user);
  await user.click(screen.getByRole('button', { name: /next/i }));
  if (n === 3) return;
  await user.click(screen.getByRole('button', { name: /next/i }));
}

describe('NewCasePage wizard', () => {
  it('starts on step 1 with a visible stepper', () => {
    setup();
    expect(currentStep()).toHaveTextContent('Case details');
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    expect(screen.getByLabelText(/case type/i)).toBeRequired();
  });

  it('shows "Incomplete case details." and highlights fields when step 1 is empty', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText('Incomplete case details.')).toBeInTheDocument();
    expect(screen.getByLabelText(/case type/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/relief sought/i)).toHaveAttribute('aria-invalid', 'true');
    expect(currentStep()).toHaveTextContent('Case details'); // did not advance
  });

  it('rejects relief sought under 20 characters', async () => {
    const user = userEvent.setup();
    setup();
    await user.selectOptions(screen.getByLabelText(/case type/i), 'CIVIL_SUIT');
    await user.type(screen.getByLabelText(/relief sought/i), 'too short');
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(
      await screen.findByText('Relief sought must be at least 20 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Incomplete case details.')).toBeInTheDocument();
  });

  it("prefills a litigant as the first petitioner, and leaves a lawyer's blank", async () => {
    const user = userEvent.setup();
    const { unmount } = setup(litigant);
    await toStep(user, 2);
    expect(screen.getAllByLabelText(/full name/i)[0]).toHaveValue('Ayesha Siddiqui');
    expect(screen.getAllByLabelText(/cnic/i)[0]).toHaveValue('36302-1111111-1');
    unmount();

    setup(lawyer);
    await toStep(user, 2);
    expect(screen.getAllByLabelText(/full name/i)[0]).toHaveValue('');
  });

  it('requires a respondent name and validates CNIC and phone formats on step 2', async () => {
    const user = userEvent.setup();
    setup();
    await toStep(user, 2);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Incomplete case details.')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/full name/i)[1]).toHaveAttribute('aria-invalid', 'true');

    await fillRespondent(user);
    await user.type(screen.getAllByLabelText(/cnic/i)[1], '3630211111111');
    await user.type(screen.getAllByLabelText(/mobile number/i)[1], '03001111111');
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('CNIC must be in the format 12345-1234567-1.')).toBeInTheDocument();
    expect(screen.getByText('Phone must be in the format +92 3XX XXXXXXX.')).toBeInTheDocument();
  });

  it('adds and removes party rows (at least one must remain)', async () => {
    const user = userEvent.setup();
    setup();
    await toStep(user, 2);
    expect(screen.getAllByLabelText(/full name/i)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /add opposing part/i }));
    expect(screen.getAllByLabelText(/full name/i)).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /remove opposing part.* 2/i }));
    expect(screen.getAllByLabelText(/full name/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /remove petitioner 1/i })).toBeDisabled();
  });

  it('keeps what you typed when moving back and forward between steps', async () => {
    const user = userEvent.setup();
    setup();
    await toStep(user, 3);
    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/relief sought/i)).toHaveValue(RELIEF);
    expect(screen.getByLabelText(/case type/i)).toHaveValue('CIVIL_SUIT');
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getAllByLabelText(/full name/i)[1]).toHaveValue('Bilal Ahmed');
  });

  describe('documents step', () => {
    it('lists valid PDFs with name and size, and lets you remove them', async () => {
      const user = userEvent.setup();
      setup();
      await toStep(user, 3);
      chooseFiles([pdf('petition.pdf', 2048), pdf('affidavit.pdf', 3 * 1024 * 1024)]);

      const list = await screen.findByRole('list', { name: /selected files/i });
      expect(within(list).getByText('petition.pdf')).toBeInTheDocument();
      expect(within(list).getByText('2 KB')).toBeInTheDocument();
      expect(within(list).getByText('3 MB')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Remove petition.pdf' }));
      expect(
        within(screen.getByRole('list', { name: /selected files/i })).queryByText('petition.pdf'),
      ).not.toBeInTheDocument();
    });

    it('refuses non-PDF and oversize files with the exact message', async () => {
      const user = userEvent.setup();
      setup();
      await toStep(user, 3);

      chooseFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
      expect(
        await screen.findByText('Only PDF format files under 25MB are allowed.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: /selected files/i })).not.toBeInTheDocument();

      chooseFiles([pdf('huge.pdf', 26 * 1024 * 1024)]);
      expect(screen.getByText('Only PDF format files under 25MB are allowed.')).toBeInTheDocument();
      expect(screen.queryByText('huge.pdf')).not.toBeInTheDocument();
    });

    it('documents are optional', async () => {
      const user = userEvent.setup();
      setup();
      await toStep(user, 3);
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(currentStep()).toHaveTextContent('Review');
    });
  });

  it('shows a summary on the review step, including the generated title', async () => {
    const user = userEvent.setup();
    setup();
    await toStep(user, 3);
    chooseFiles([pdf('petition.pdf')]);
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Civil Suit')).toBeInTheDocument();
    expect(screen.getByText('Ayesha Siddiqui vs. Bilal Ahmed')).toBeInTheDocument();
    expect(screen.getByText(RELIEF)).toBeInTheDocument();
    expect(screen.getByText(/petition\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit case/i })).toBeInTheDocument();
  });

  describe('submitting', () => {
    it('sends multipart data and shows the success message with the UCN in a monospace card', async () => {
      const user = userEvent.setup();
      restore = mockApi((req) => {
        if (req.method === 'post' && req.url === '/cases') {
          return {
            status: 201,
            data: {
              message: 'Case form data captured successfully.',
              case: {
                id: 'c1',
                ucn: 'DA-2026-CIV-000045',
                status: 'PENDING_ASSIGNMENT',
                title: 'x',
                documentCount: 1,
              },
            },
          };
        }
        return { status: 404 };
      });
      setup();
      await toStep(user, 3);
      chooseFiles([pdf('petition.pdf')]);
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /submit case/i }));

      expect(await screen.findByText('Case form data captured successfully.')).toBeInTheDocument();
      const ucn = screen.getByTestId('ucn');
      expect(ucn).toHaveTextContent('DA-2026-CIV-000045');
      expect(ucn).toHaveClass('case-number');
      expect(screen.getByRole('link', { name: /open case/i })).toHaveAttribute(
        'href',
        '/litigant/cases/c1',
      );

      const call = (restore as unknown as { calls: { data: FormData }[] }).calls[0];
      const body = JSON.parse(call.data.get('data') as string);
      expect(body).toMatchObject({
        caseType: 'CIVIL_SUIT',
        reliefSought: RELIEF,
        petitioners: [{ name: 'Ayesha Siddiqui', cnic: '36302-1111111-1' }],
        respondents: [{ name: 'Bilal Ahmed' }],
      });
      expect(body.title).toBeUndefined(); // empty optional title is not sent
      expect(call.data.getAll('files')).toHaveLength(1);
    });

    it('sends the request only once even if the button is clicked twice', async () => {
      const user = userEvent.setup();
      let resolveRequest: (() => void) | undefined;
      const mock = mockApi(
        () =>
          new Promise((resolve) => {
            resolveRequest = () =>
              resolve({
                status: 201,
                data: {
                  message: 'Case form data captured successfully.',
                  case: {
                    id: 'c1',
                    ucn: 'DA-2026-CIV-000001',
                    status: 'PENDING_ASSIGNMENT',
                    title: 't',
                    documentCount: 0,
                  },
                },
              });
          }),
      );
      restore = mock;
      setup();
      await toStep(user, 4);
      const submit = screen.getByRole('button', { name: /submit case/i });
      await user.click(submit);
      await user.click(submit);
      await waitFor(() => expect(submit).toBeDisabled());
      expect(mock.calls).toHaveLength(1);
      resolveRequest?.();
      expect(await screen.findByTestId('ucn')).toBeInTheDocument();
    });

    it('jumps to the step with the problem and highlights the field on "Incomplete case details."', async () => {
      const user = userEvent.setup();
      restore = mockApi(() => ({
        status: 400,
        data: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Incomplete case details.',
          details: [{ field: 'respondents.0.name', messages: ['name should not be empty'] }],
        },
      }));
      setup();
      await toStep(user, 4);
      await user.click(screen.getByRole('button', { name: /submit case/i }));

      expect(await screen.findByText('Incomplete case details.')).toBeInTheDocument();
      await waitFor(() => expect(currentStep()).toHaveTextContent('Parties'));
      expect(screen.getAllByLabelText(/full name/i)[1]).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('name should not be empty')).toBeInTheDocument();
    });

    it('returns to the documents step when the server rejects a file', async () => {
      const user = userEvent.setup();
      restore = mockApi(() => ({
        status: 400,
        data: {
          statusCode: 400,
          code: 'INVALID_FILE',
          message: 'Only PDF format files under 25MB are allowed.',
        },
      }));
      setup();
      await toStep(user, 3);
      chooseFiles([pdf('fake.pdf')]);
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /submit case/i }));

      await waitFor(() => expect(currentStep()).toHaveTextContent('Documents'));
      expect(
        screen.getAllByText('Only PDF format files under 25MB are allowed.').length,
      ).toBeGreaterThan(0);
    });

    it('shows "Case registration is currently closed." when the server says so', async () => {
      const user = userEvent.setup();
      restore = mockApi(() => ({
        status: 403,
        data: {
          statusCode: 403,
          code: 'REGISTRATION_CLOSED',
          message: 'Case registration is currently closed.',
        },
      }));
      setup();
      await toStep(user, 4);
      await user.click(screen.getByRole('button', { name: /submit case/i }));
      expect(await screen.findByText('Case registration is currently closed.')).toBeInTheDocument();
    });
  });

  describe('unsaved changes', () => {
    it('asks before following a link while there is unsaved input, and lets you stay', async () => {
      const user = userEvent.setup();
      setup();
      await user.type(screen.getByLabelText(/relief sought/i), 'something typed');
      await user.click(screen.getByRole('link', { name: 'Hearings link' }));

      expect(await screen.findByRole('dialog', { name: /leave this page/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /stay on this page/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByLabelText(/relief sought/i)).toHaveValue('something typed');
    });

    it('leaves after confirmation', async () => {
      const user = userEvent.setup();
      setup();
      await user.type(screen.getByLabelText(/relief sought/i), 'something typed');
      await user.click(screen.getByRole('link', { name: 'Hearings link' }));
      await user.click(await screen.findByRole('button', { name: /leave and discard/i }));
      expect(await screen.findByTestId('location')).toHaveTextContent('/litigant/hearings');
    });

    it('does not interrupt when nothing has been entered', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('link', { name: 'Hearings link' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('registers a beforeunload warning only while there are unsaved changes', async () => {
      const user = userEvent.setup();
      setup();
      const fire = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(fire()).toBe(false);
      await user.type(screen.getByLabelText(/relief sought/i), 'x');
      expect(fire()).toBe(true);
    });
  });
});
