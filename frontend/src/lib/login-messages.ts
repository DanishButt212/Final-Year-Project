import { msg } from '@/i18n';
/** Role-specific success toast shown after the generic login. */
export function loginToast(role: string, serverMessage: string) {
  switch (role) {
    case 'INTERN':
      return msg('Intern session initialized successfully.');
    case 'PROCESS_SERVER':
      return msg('Field session initialized successfully.');
    case 'ADMIN':
      return msg('Welcome Admin: High-clearance system operational console activated.');
    default:
      return serverMessage;
  }
}

export const CHAMBER_LOGIN_FAILED = msg(
  'Authentication Failure: Check Chamber ID or security parameters.',
);
