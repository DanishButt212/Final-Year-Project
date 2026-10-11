import { ROLE_LABEL } from '@/lib/navigation';
import type { Role } from '@/lib/types';

/** Readable names for event and action codes shown to administrators (audit vault, security, notifications). */
const CODE_LABEL: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: 'Login succeeded',
  AUTH_LOGIN_FAILURE: 'Login failed',
  AUTH_CHAMBER_LOGIN_FAILURE: 'Chamber desk login failed',
  AUTH_ACCOUNT_LOCKED: 'Account locked after failed logins',
  AUTH_LOGOUT: 'Logged out',
  AUTH_REGISTER: 'Account registered',
  AUTH_PASSWORD_RESET_REQUESTED: 'Password reset requested',
  AUTH_PASSWORD_RESET_COMPLETED: 'Password reset completed',
  ADMIN_ROUTE_FORBIDDEN: 'Refused access to an admin page',
  ADMIN_ROUTE_INVALID_TOKEN: 'Forged or invalid token on an admin page',
  ADMIN_CASE_ALLOCATED: 'Case allocated',
  ADMIN_USER_PROVISIONED: 'Staff account created',
  ADMIN_USER_STATUS_CHANGED: 'Account status changed',
  ADMIN_LAWYER_BAR_CHECK: 'Bar Council check',
  ADMIN_LAWYER_VERIFIED: 'Lawyer verified',
  ADMIN_LAWYER_REJECTED: 'Lawyer rejected',
  ADMIN_SETTINGS_UPDATED: 'System policies updated',
  ADMIN_HOST_BLOCKED: 'Host blocked',
  ADMIN_HOST_UNBLOCKED: 'Host unblocked',
  ADMIN_SECURITY_ALERT_DISMISSED: 'Security alert dismissed',
  ADMIN_AUDIT_INTEGRITY_VERIFIED: 'Audit log integrity verified',
  CASE_SUBMITTED: 'Case filed',
  CASE_DECIDED: 'Case decided',
  CHALLAN_GENERATED: 'Challan generated',
  CHALLAN_RECALCULATED: 'Challan recalculated',
  PAYMENT_SUCCESS: 'Payment received',
  PAYMENT_FAILED: 'Payment failed',
  FILE_INTEGRITY_FAILED: 'File failed its integrity check',
  SECURITY_ESCALATION_ALERT: 'Privilege escalation alert',
  SECURITY_SESSION_TERMINATED: 'Session ended by the security engine',
  VIRTUAL_SESSION_INITIALIZED: 'Virtual courtroom opened',
  VIRTUAL_SESSION_ENDED: 'Virtual courtroom ended',
  VIRTUAL_SESSION_JOINED: 'Joined the virtual courtroom',
  VIRTUAL_SESSION_COMMAND: 'Courtroom moderation command',
};

/** "HEARING_SCHEDULED" → "Hearing scheduled" (explicit labels first, then sentence case). */
export function codeLabel(code: string): string {
  if (CODE_LABEL[code]) return CODE_LABEL[code];
  if (code in ROLE_LABEL) return ROLE_LABEL[code as Role];
  const words = code.toLowerCase().split('_').filter(Boolean);
  return words.length ? words.join(' ').replace(/^./, (c) => c.toUpperCase()) : code;
}

export const roleLabel = (role: string) => ROLE_LABEL[role as Role] ?? codeLabel(role);

/** Replaces raw codes (ADMIN_ROUTE_FORBIDDEN, PROCESS_SERVER, ...) inside a sentence with readable labels. */
export const humanizeCodes = (text: string) =>
  text.replace(/\b[A-Z]{2,}(?:_[A-Z]{2,})+\b/g, (code) => codeLabel(code).toLowerCase());
