import { api } from './api';
import type { CaseType } from './case-status';

export type InsightStage = 'FEE_PAID' | 'ALLOCATED' | 'HEARING' | 'DECIDED' | 'CLOSED';

export interface PartyInsights {
  role: 'LITIGANT' | 'LAWYER';
  casesByStage: { stage: InsightStage; count: number }[];
  /** Next 30 days, one row per day (YYYY-MM-DD). */
  upcomingHearings: { date: string; count: number }[];
  /** January to December of this year; amounts are decimal strings (PKR). */
  paymentsThisYear: { month: string; amount: string }[];
}

export interface JudgeInsights {
  role: 'JUDGE';
  hearingsPerDay: { date: string; count: number; week: 'THIS' | 'NEXT' }[];
  outcomesThisMonth: { status: 'HELD' | 'ADJOURNED' | 'CANCELLED'; count: number }[];
  pendingDecisions: number;
  averageDaysFirstHearingToDecision: number | null;
  decidedCount: number;
}

export interface AdminInsights {
  role: 'ADMIN';
  filingsPerMonth: { month: string; count: number }[];
  disposalRate: { month: string; filed: number; decided: number; rate: number | null }[];
  casesByCategory: { caseType: CaseType; count: number }[];
  feeRevenuePerMonth: { month: string; amount: string }[];
  averageDaysFilingToDecision: number | null;
  decidedCount: number;
  topCourtrooms: { courtroomId: string; name: string; court: string; hearings: number }[];
}

export type Insights = PartyInsights | JudgeInsights | AdminInsights;

export const INSIGHTS_KEY = ['insights'];

export const insightsApi = {
  async get() {
    return (await api.get<Insights>('/insights')).data;
  },
};
