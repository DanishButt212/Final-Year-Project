import { msg } from '@/i18n';
import { api } from './api';
import type { PublicCaseStatus } from './progress';

/** Strict UCN format: DA-<year>-<CIV|CRA|WRT|BAL>-<6 digits> (mirrors backend/src/cases/ucn.ts). */
export const UCN_REGEX = /^DA-\d{4}-(CIV|CRA|WRT|BAL)-\d{6}$/;

export const UCN_FORMAT_MESSAGE = msg('Enter a valid UCN, for example DA-2026-CIV-000001.');

export const publicApi = {
  /** GET /public/cases/status: no login, only non-sensitive progress. */
  caseStatus: async (ucn: string) =>
    (await api.get<PublicCaseStatus>('/public/cases/status', { params: { ucn } })).data,
};
