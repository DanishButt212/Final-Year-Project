import { Injectable } from '@nestjs/common';
import { CNIC_REGEX } from '../../common/patterns';

export interface NadraVerification {
  verified: boolean;
  reference: string;
  checkedAt: string;
  reason?: string;
}

/**
 * MOCK of the NADRA CNIC verification service (report: external systems are mocked).
 * Rule: the CNIC must match 12345-1234567-1; numbers starting with 00000 simulate a failed lookup.
 */
@Injectable()
export class MockNadraService {
  verifyCnic(cnic: string): NadraVerification {
    const checkedAt = new Date().toISOString();
    const reference = `NADRA-MOCK-${cnic.replace(/-/g, '')}`;
    if (!CNIC_REGEX.test(cnic)) {
      return { verified: false, reference, checkedAt, reason: 'Invalid CNIC format' };
    }
    if (cnic.startsWith('00000')) {
      return { verified: false, reference, checkedAt, reason: 'CNIC not found (simulated)' };
    }
    return { verified: true, reference, checkedAt };
  }
}
