/** CNIC: 12345-1234567-1 */
export const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;
/** Phone: +92 3XX XXXXXXX */
export const PHONE_REGEX = /^\+92 3\d{2} \d{7}$/;
/** Min 8 chars with upper, lower and a digit. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export const CNIC_MESSAGE = 'CNIC must be in the format 12345-1234567-1.';
export const PHONE_MESSAGE = 'Phone must be in the format +92 3XX XXXXXXX.';
export const PASSWORD_MESSAGE =
  'Password must be 8 to 72 characters with an uppercase letter, a lowercase letter and a number.';
