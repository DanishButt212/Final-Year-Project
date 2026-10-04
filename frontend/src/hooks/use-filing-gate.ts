import { useAuth } from '@/auth/useAuth';
import { usePublicSettings } from './use-public-settings';

export const LAWYER_PENDING_MESSAGE =
  'Your lawyer profile is pending verification. You can file cases once the registrar approves your bar credentials.';
export const REGISTRATION_CLOSED_MESSAGE = 'Case registration is currently closed.';

/** Whether the signed-in litigant or lawyer may start a new filing right now, and why not. */
export function useFilingGate(): { canFile: boolean; reason: string | null } {
  const { user } = useAuth();
  const { caseRegistrationOpen } = usePublicSettings();
  if (user?.role === 'LAWYER' && user.lawyerProfile?.verificationStatus !== 'VERIFIED') {
    return { canFile: false, reason: LAWYER_PENDING_MESSAGE };
  }
  if (!caseRegistrationOpen) return { canFile: false, reason: REGISTRATION_CLOSED_MESSAGE };
  return { canFile: true, reason: null };
}
