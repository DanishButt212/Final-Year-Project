import { z } from 'zod';

/** Messages are part of the product spec; the form-level summaries below are the exact required strings. */
export const MESSAGES = {
  fieldRequired: 'This field is required.',
  missingFields: 'Please complete all required fields.',
  invalidFields: 'Please correct the highlighted fields.',
  loginFailed: 'Invalid username or password.',
  loginSuccess: 'Logged into the system successfully.',
  registerSuccess: 'Your registration request has been submitted successfully.',
  resetSuccess: 'Password updated successfully.',
  profileUpdated: 'Profile details updated successfully.',
} as const;

export const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;
export const PHONE_REGEX = /^\+92 3\d{2} \d{7}$/;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

const required = z.string().trim().min(1, MESSAGES.fieldRequired);

const cnic = required.regex(CNIC_REGEX, 'CNIC must be in the format 12345-1234567-1.');
const phone = required.regex(PHONE_REGEX, 'Phone must be in the format +92 3XX XXXXXXX.');
const email = required.email('Enter a valid email address.');
const password = z
  .string()
  .min(1, MESSAGES.fieldRequired)
  .regex(
    PASSWORD_REGEX,
    'Password must be 8 to 72 characters with an uppercase letter, a lowercase letter and a number.',
  );
const confirmPassword = z.string().min(1, MESSAGES.fieldRequired);

const passwordsMatch = <T extends { password: string; confirmPassword: string }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.confirmPassword && data.password !== data.confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
  }
};

export const loginSchema = z.object({
  identifier: required,
  password: z.string().min(1, MESSAGES.fieldRequired),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    role: z.enum(['LITIGANT', 'LAWYER']),
    firstName: required.max(50, 'Use 50 characters or fewer.'),
    lastName: required.max(50, 'Use 50 characters or fewer.'),
    cnic,
    email,
    phone,
    password,
    confirmPassword,
    barNumber: z
      .string()
      .trim()
      .max(30, 'Use 30 characters or fewer.')
      .regex(/^[A-Za-z0-9/-]*$/, 'Bar number may contain letters, digits, - and /.')
      .optional(),
  })
  .superRefine(passwordsMatch);
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ password, confirmPassword })
  .superRefine(passwordsMatch);
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const profileSchema = z.object({
  phone,
  profileImage: z
    .string()
    .trim()
    .max(500, 'Use 500 characters or fewer.')
    .regex(
      /^(https?:\/\/\S+|\/uploads\/[\w\-./]+)?$/,
      'Profile image must be a link starting with https://.',
    )
    .optional(),
});
export type ProfileValues = z.infer<typeof profileSchema>;

/** Chooses the form-level summary that goes with a set of field errors. */
export function summaryFor(errors: Record<string, { message?: string } | undefined>): string {
  const messages = Object.values(errors).map((e) => e?.message);
  return messages.includes(MESSAGES.fieldRequired)
    ? MESSAGES.missingFields
    : MESSAGES.invalidFields;
}
