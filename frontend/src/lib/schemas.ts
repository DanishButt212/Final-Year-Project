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
  caseIncomplete: 'Incomplete case details.',
  caseSubmitted: 'Case form data captured successfully.',
  documentAttached: 'Legal document attached successfully.',
  emptyPortfolio: 'No active or past legal cases found in your portfolio.',
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

// ------------------------------------------------------------------ case filing (UC-2.1)

const optionalCnic = z
  .string()
  .trim()
  .regex(/^(\d{5}-\d{7}-\d)?$/, 'CNIC must be in the format 12345-1234567-1.');
const optionalPhone = z
  .string()
  .trim()
  .regex(/^(\+92 3\d{2} \d{7})?$/, 'Phone must be in the format +92 3XX XXXXXXX.');

export const partySchema = z.object({
  name: required.max(120, 'Use 120 characters or fewer.'),
  cnic: optionalCnic,
  address: z.string().trim().max(300, 'Use 300 characters or fewer.'),
  phone: optionalPhone,
});
export type PartyValues = z.infer<typeof partySchema>;

export const caseSchema = z.object({
  caseType: z.enum(['CIVIL_SUIT', 'CRIMINAL_APPEAL', 'WRIT_PETITION', 'BAIL_APPLICATION'], {
    message: MESSAGES.fieldRequired,
  }),
  title: z.string().trim().max(200, 'Use 200 characters or fewer.'),
  reliefSought: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .min(20, 'Relief sought must be at least 20 characters.')
    .max(5000, 'Use 5000 characters or fewer.'),
  claimAmountPkr: z
    .string()
    .trim()
    .regex(/^(\d{1,12}(\.\d{1,2})?)?$/, 'Enter an amount of 0 or more in PKR, for example 1850000.')
    .optional(),
  petitioners: z.array(partySchema).min(1, 'Add at least one petitioner.'),
  respondents: z.array(partySchema).min(1, 'Add at least one respondent.'),
});
export type CaseValues = z.infer<typeof caseSchema>;

export const CASE_STEP_FIELDS = {
  1: ['caseType', 'title', 'reliefSought', 'claimAmountPkr'],
  2: ['petitioners', 'respondents'],
} as const;

/** Case form summary: blank or too-short mandatory fields are "incomplete", anything else is "invalid". */
export function caseSummaryFor(errors: unknown): string {
  const incomplete = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    const message = (node as { message?: unknown }).message;
    if (
      typeof message === 'string' &&
      (message === MESSAGES.fieldRequired ||
        message.startsWith('Relief sought must be at least') ||
        message.startsWith('Add at least'))
    ) {
      return true;
    }
    return Object.values(node as Record<string, unknown>).some(
      (child) => child !== node && typeof child === 'object' && incomplete(child),
    );
  };
  return incomplete(errors) ? MESSAGES.caseIncomplete : MESSAGES.invalidFields;
}
