/** Role-specific success toast shown after the generic login. */
export function loginToast(role: string, serverMessage: string) {
  switch (role) {
    case 'INTERN':
      return 'Intern session initialized successfully.';
    case 'PROCESS_SERVER':
      return 'Field session initialized successfully.';
    case 'ADMIN':
      return 'Welcome Admin: High-clearance system operational console activated.';
    default:
      return serverMessage;
  }
}

export const CHAMBER_LOGIN_FAILED =
  'Authentication Failure: Check Chamber ID or security parameters.';
