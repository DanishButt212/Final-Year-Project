import type { TFunction } from 'i18next';
import { msg } from '@/i18n';
import { formatDate } from './format';
import type { CaseStatus, CaseType } from './case-status';

/** Mirrors backend/src/cases/case-progress.ts (one derivation of the stage, shared by every response). */
export const PROGRESS_STAGES = ['FILED', 'FEE_PAID', 'ALLOCATED', 'HEARING', 'DECIDED'] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];
export type StageState = 'completed' | 'current' | 'upcoming';
export type DecisionType = 'JUDGMENT' | 'DISMISSED' | 'DISPOSED';

export interface ProgressHearing {
  date: string;
  startTime: string | null;
  endTime: string | null;
  timeSlot: number | null;
  courtroom: string | null;
  isVirtual: boolean;
  /** Public status only: time and courtroom are shown once the cause list is published. */
  published?: boolean;
}

export type ProgressDetail =
  | { kind: 'AWAITING_FEE' }
  | { kind: 'AWAITING_ALLOCATION' }
  | { kind: 'AWAITING_HEARING_DATE' }
  | { kind: 'NEXT_HEARING'; hearing: ProgressHearing | null }
  | { kind: 'ADJOURNED'; hearing: ProgressHearing | null }
  | { kind: 'DECIDED'; decisionType: DecisionType | null }
  | { kind: 'CLOSED'; status: CaseStatus };

export interface CaseProgressData {
  stages: { key: ProgressStage; state: StageState; date: string | null }[];
  current: ProgressStage | null;
  terminal: CaseStatus | null;
  detail: ProgressDetail;
  nextHearing?: ProgressHearing | null;
}

export interface PublicCaseStatus {
  ucn: string;
  caseType: CaseType;
  court: string | null;
  filingDate: string | null;
  stage: ProgressStage | CaseStatus;
  progress: CaseProgressData;
  nextHearing: ProgressHearing | null;
}

export const STAGE_LABEL: Record<ProgressStage, string> = {
  FILED: msg('Filed'),
  FEE_PAID: msg('Fee Paid'),
  ALLOCATED: msg('Allocated'),
  HEARING: msg('Hearing'),
  DECIDED: msg('Decided'),
};

export const DECISION_LABEL: Record<DecisionType, string> = {
  JUDGMENT: msg('Judgment'),
  DISMISSED: msg('Dismissed'),
  DISPOSED: msg('Disposed'),
};

/** "14-10-2026, 10:30, Courtroom 3" with whatever parts are known. */
export function hearingWhen(h: ProgressHearing): string {
  return [formatDate(h.date), h.startTime, h.courtroom].filter(Boolean).join(', ');
}

/** One line under the current stage, e.g. "Next hearing 14-10-2026, 10:30, Courtroom 3". */
export function describeProgress(p: CaseProgressData, t: TFunction): string {
  const d = p.detail;
  switch (d.kind) {
    case 'AWAITING_FEE':
      return t('Awaiting fee payment');
    case 'AWAITING_ALLOCATION':
      return t('Awaiting allocation to a judge');
    case 'AWAITING_HEARING_DATE':
      return t('Awaiting a hearing date');
    case 'NEXT_HEARING':
      return d.hearing
        ? t('Next hearing {{when}}', { when: hearingWhen(d.hearing) })
        : t('Hearing scheduled');
    case 'ADJOURNED':
      return d.hearing
        ? t('Adjourned to {{when}}', { when: hearingWhen(d.hearing) })
        : t('Adjourned');
    case 'DECIDED': {
      const date = p.stages.find((s) => s.key === 'DECIDED')?.date;
      const type = d.decisionType ? t(DECISION_LABEL[d.decisionType]) : null;
      return [date ? t('Decided on {{date}}', { date: formatDate(date) }) : t('Decided'), type]
        .filter(Boolean)
        .join(' · ');
    }
    case 'CLOSED':
      return d.status === 'REJECTED' ? t('Case rejected') : t('Case dismissed');
  }
}

/** A static example used where there is no real case (the landing page "How it works"). */
export const EXAMPLE_PROGRESS: CaseProgressData = {
  stages: PROGRESS_STAGES.map((key, i) => ({
    key,
    state: i < 3 ? 'completed' : i === 3 ? 'current' : 'upcoming',
    date: null,
  })),
  current: 'HEARING',
  terminal: null,
  detail: { kind: 'AWAITING_HEARING_DATE' },
};
