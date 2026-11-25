import { msg } from '@/i18n';
import { api } from './api';

export const absenceLabels = {
  PENDING_DECISION: msg('Pending judge decision'),
  NO_FINE: msg('No Fine'),
  AWAITING_FINE_AMOUNT: msg('Awaiting Fine Amount'),
  FINE_RECORDED: msg('Fine recorded'),
};

export type AbsenceSummary = {
  id: string;
  hearing: { id: string };
  lawyer: string;
  status: keyof typeof absenceLabels;
  amount: string | null;
};

export async function caseAbsences(caseId: string) {
  return (await api.get<AbsenceSummary[]>('/hearing-coverage/absences', { params: { caseId } })).data;
}
