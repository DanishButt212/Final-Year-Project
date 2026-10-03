/** User-facing messages. These exact strings are part of the product spec. */
export const Messages = {
  MISSING_FIELDS: 'Please complete all required fields.',
  INVALID_FIELDS: 'Please correct the highlighted fields.',
  DUPLICATE_IDENTIFIER: 'This account identifier is already in use. Please choose a different one.',
  REGISTER_SUCCESS: 'Your registration request has been submitted successfully.',
  LOGIN_SUCCESS: 'Logged into the system successfully.',
  LOGIN_FAILED: 'Invalid username or password.',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  FORGOT_PASSWORD_GENERIC:
    'If an account with that email exists, a password reset link has been sent.',
  RESET_SUCCESS: 'Password updated successfully.',
  RESET_INVALID: 'This password reset link is invalid or has expired.',
  PROFILE_UPDATED: 'Profile details updated successfully.',
  UNAUTHORIZED: 'You must be logged in to access this resource.',
  FORBIDDEN: 'You do not have permission to access this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait a minute and try again.',
  INTERNAL: 'Something went wrong. Please try again later.',
  CNIC_NOT_VERIFIED: 'The CNIC could not be verified with NADRA. Please check the number.',
} as const;
