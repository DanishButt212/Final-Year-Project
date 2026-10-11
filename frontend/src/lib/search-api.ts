import { api } from './api';
import type { CaseStatus, CaseType } from './case-status';
import type { ProgressStage } from './progress';

export interface SearchCase {
  id: string;
  ucn: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  stage: ProgressStage | CaseStatus;
  parties: string[];
}

export const searchApi = {
  /** GET /search?q= : cases the user may open (at most 8). */
  cases: async (q: string, signal?: AbortSignal) =>
    (await api.get<{ cases: SearchCase[] }>('/search', { params: { q }, signal })).data.cases,
};
