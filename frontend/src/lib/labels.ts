import { ROLE_LABEL } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import i18n, { msg } from '@/i18n';

/** Readable names for event and action codes shown to administrators (audit vault, security, notifications). */
const CODE_LABEL: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: msg('Login succeeded'),
  AUTH_LOGIN_FAILURE: msg('Login failed'),
  AUTH_CHAMBER_LOGIN_FAILURE: msg('Chamber desk login failed'),
  AUTH_ACCOUNT_LOCKED: msg('Account locked after failed logins'),
  AUTH_LOGOUT: msg('Logged out'),
  AUTH_REGISTER: msg('Account registered'),
  AUTH_PASSWORD_RESET_REQUESTED: msg('Password reset requested'),
  AUTH_PASSWORD_RESET_COMPLETED: msg('Password reset completed'),
  ADMIN_ROUTE_FORBIDDEN: msg('Refused access to an admin page'),
  ADMIN_ROUTE_INVALID_TOKEN: msg('Forged or invalid token on an admin page'),
  ADMIN_CASE_ALLOCATED: msg('Case allocated'),
  ADMIN_USER_PROVISIONED: msg('Staff account created'),
  ADMIN_USER_STATUS_CHANGED: msg('Account status changed'),
  ADMIN_LAWYER_BAR_CHECK: msg('Bar Council check'),
  ADMIN_LAWYER_VERIFIED: msg('Lawyer verified'),
  ADMIN_LAWYER_REJECTED: msg('Lawyer rejected'),
  ADMIN_SETTINGS_UPDATED: msg('System policies updated'),
  ADMIN_HOST_BLOCKED: msg('Host blocked'),
  ADMIN_HOST_UNBLOCKED: msg('Host unblocked'),
  ADMIN_SECURITY_ALERT_DISMISSED: msg('Security alert dismissed'),
  ADMIN_AUDIT_INTEGRITY_VERIFIED: msg('Audit log integrity verified'),
  CASE_SUBMITTED: msg('Case filed'),
  CASE_DECIDED: msg('Case decided'),
  CHALLAN_GENERATED: msg('Challan generated'),
  CHALLAN_RECALCULATED: msg('Challan recalculated'),
  PAYMENT_SUCCESS: msg('Payment received'),
  PAYMENT_FAILED: msg('Payment failed'),
  FILE_INTEGRITY_FAILED: msg('File failed its integrity check'),
  SECURITY_ESCALATION_ALERT: msg('Privilege escalation alert'),
  SECURITY_SESSION_TERMINATED: msg('Session ended by the security engine'),
  VIRTUAL_SESSION_INITIALIZED: msg('Virtual courtroom opened'),
  VIRTUAL_SESSION_ENDED: msg('Virtual courtroom ended'),
  VIRTUAL_SESSION_JOINED: msg('Joined the virtual courtroom'),
  VIRTUAL_SESSION_COMMAND: msg('Courtroom moderation command'),
  USER_PROFILE_UPDATED: msg('User profile updated'),
  CASE_DOCUMENT_ATTACHED: msg('Case document attached'),
  CASE_DOCUMENT_DOWNLOADED: msg('Case document downloaded'),
  ADMIN_COURTROOM_CREATED: msg('Courtroom created'),
  ADMIN_COURTROOM_UPDATED: msg('Courtroom updated'),
  HEARING_SCHEDULED: msg('Hearing scheduled'),
  HEARING_RESCHEDULED: msg('Hearing rescheduled'),
  HEARING_CANCELLED: msg('Hearing cancelled'),
  SCHEDULE_AUTO_GENERATED: msg('Schedule generated automatically'),
  CAUSE_LIST_PUBLISHED: msg('Cause list published'),
  EVIDENCE_UPLOADED: msg('Evidence uploaded'),
  EVIDENCE_EDITED: msg('Evidence edited'),
  EVIDENCE_DELETED: msg('Evidence deleted'),
  EVIDENCE_DOWNLOADED: msg('Evidence downloaded'),
  EVIDENCE_LOCKED: msg('Evidence locked'),
  NOTIFICATION_PREFERENCES_SAVED: msg('Notification preferences saved'),
  FEEDBACK_SUBMITTED: msg('Feedback submitted'),
  FEEDBACK_REVIEWED: msg('Feedback reviewed'),
  CHAMBER_PROFILE_UPDATED: msg('Chamber profile updated'),
  CHAMBER_CLIENT_CREATED: msg('Client registered'),
  CHAMBER_CLIENT_UPDATED: msg('Client updated'),
  CHAMBER_BILLABLE_RECORDED: msg('Billable time recorded'),
  CHAMBER_RETAINER_DEPOSIT: msg('Retainer deposit recorded'),
  CHAMBER_LOW_BALANCE_ALERT: msg('Low balance alert issued'),
  CHAMBER_EXPENSE_RECORDED: msg('Expense recorded'),
  CHAMBER_INTERN_CREATED: msg('Intern account created'),
  CHAMBER_INTERN_STATUS_CHANGED: msg('Intern status changed'),
  RESEARCH_LOG_CREATED: msg('Research log created'),
  RESEARCH_LOG_UPDATED: msg('Research log updated'),
  RESEARCH_LOG_REVIEWED: msg('Research log reviewed'),
  ATTENDANCE_CHECKIN: msg('Attendance check-in'),
  ATTENDANCE_CHECKOUT: msg('Attendance check-out'),
  ATTENDANCE_REJECTED: msg('Attendance rejected'),
  ADMIN_COURT_GEOFENCE_UPDATED: msg('Court geo-fence updated'),
  SUMMONS_ISSUED: msg('Summons issued'),
  SUMMONS_REASSIGNED: msg('Summons reassigned'),
  SUMMONS_CANCELLED: msg('Summons cancelled'),
  SUMMONS_ATTEMPT: msg('Summons attempt'),
  SUMMONS_EXECUTED: msg('Summons executed'),
  SUMMONS_SEAL_VERIFIED: msg('Summons seal verified'),
  SUMMONS_PROOF_VIEWED: msg('Summons proof viewed'),
  SERVER_PROFILE_UPDATED: msg('Process server profile updated'),
  HEARING_OUTCOME_RECORDED: msg('Hearing outcome recorded'),
  REPORT_EXPORTED: msg('Report exported'),
  REPORT_DOWNLOADED: msg('Report downloaded'),
  REPORT_VERIFIED: msg('Report verified'),
  CHAMBER_INTERN_CERTIFICATE_ISSUED: msg('Completion certificate issued'),
  SECURITY_PUBLIC_STATUS_PROBE: msg('Repeated case status lookups'),
  UCN_LOOKUP_REPEATED_FAILURES: msg('Repeated failed UCN lookups'),
  CASE_STATUS_PROBE: msg('Case status probe'),
  PRIVILEGE_ESCALATION: msg('Privilege escalation'),
};

/** "HEARING_SCHEDULED" → "Hearing scheduled" (explicit labels first, then sentence case). The label in the current language (unknown codes fall back to sentence case, untranslated). */
export function codeLabel(code: string): string {
  if (CODE_LABEL[code]) return i18n.t(CODE_LABEL[code]);
  if (code in ROLE_LABEL) return i18n.t(ROLE_LABEL[code as Role]);
  const words = code.toLowerCase().split('_').filter(Boolean);
  return words.length ? words.join(' ').replace(/^./, (c) => c.toUpperCase()) : code;
}

export const roleLabel = (role: string) =>
  ROLE_LABEL[role as Role] ? i18n.t(ROLE_LABEL[role as Role]) : codeLabel(role);

/** Replaces raw codes (ADMIN_ROUTE_FORBIDDEN, PROCESS_SERVER, ...) inside a sentence with readable labels. */
export const humanizeCodes = (text: string) =>
  text.replace(/\b[A-Z]{2,}(?:_[A-Z]{2,})+\b/g, (code) => codeLabel(code).toLowerCase());
