import { Injectable } from '@nestjs/common';

export interface BarCheckResult {
  barNumber: string | null;
  found: boolean;
  reason: string;
  checkedAt: string;
}

/** Numbers the mocked bar association repository reports as revoked or struck off. */
const REVOKED = new Set(['LH-99999', 'LH-00000', 'PB-123456']);
const BAR_NUMBER = /^[A-Z]{2}-\d{4,6}$/;

/** MOCK Bar Council repository: deterministic, no network (UC-2.2). */
@Injectable()
export class MockBarCouncilService {
  lookup(barNumber: string | null | undefined): BarCheckResult {
    const checkedAt = new Date().toISOString();
    const number = barNumber?.trim().toUpperCase() ?? null;
    if (!number) {
      return { barNumber: null, found: false, reason: 'No bar number was submitted.', checkedAt };
    }
    if (REVOKED.has(number)) {
      return {
        barNumber: number,
        found: false,
        reason: 'Licence revoked in the Bar Council register.',
        checkedAt,
      };
    }
    if (BAR_NUMBER.test(number)) {
      return { barNumber: number, found: true, reason: 'Active licence found.', checkedAt };
    }
    return {
      barNumber: number,
      found: false,
      reason: 'No record matches this bar number.',
      checkedAt,
    };
  }
}
