import { AuthorizeDto } from './fees.dto';
import { pkParts } from '../common/pk-time';

/** Strict gateway: only the documented test numbers are approved. Everything else is declined. */
const APPROVE_CARDS = ['4242424242424242', '5555555555554444'];
const INSUFFICIENT_FUNDS_CARD = '4000000000000002';

function brandOf(digits: string): string {
  if (digits.startsWith('4')) return 'VISA';
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'CARD';
}

interface Decision {
  approved: boolean;
  reason: 'APPROVED' | 'INSUFFICIENT_FUNDS' | 'INVALID_CARD' | 'EXPIRED_CARD' | 'INVALID_DETAILS';
  brand: string | null;
  last4: string | null;
}

/**
 * The simulated gateway decides in memory. Card credentials and wallet numbers are never stored or logged.
 * Only card brand and last four digits leave this function; wallet decisions contain neither.
 */
export function decide(dto: AuthorizeDto): Decision {
  if (dto.method === 'MOCK_BANK_TRANSFER') {
    return {
      approved: dto.transferReference === 'DEMO-BANK-APPROVED',
      reason:
        dto.transferReference === 'DEMO-BANK-APPROVED'
          ? 'APPROVED'
          : dto.transferReference === 'DEMO-BANK-DECLINED'
            ? 'INSUFFICIENT_FUNDS'
            : 'INVALID_DETAILS',
      brand: null,
      last4: null,
    };
  }
  if (dto.method === 'MOCK_JAZZCASH' || dto.method === 'MOCK_EASYPAISA') {
    return {
      approved: dto.mobileNumber === '03000000000',
      reason:
        dto.mobileNumber === '03000000000'
          ? 'APPROVED'
          : dto.mobileNumber === '03000000001'
            ? 'INSUFFICIENT_FUNDS'
            : 'INVALID_DETAILS',
      brand: null,
      last4: null,
    };
  }
  const digits = dto.cardNumber.replace(/\s+/g, '');
  const last4 = digits.slice(-4);
  const brand = brandOf(digits);
  const [mm, yy] = dto.expiry.split('/').map(Number);
  const now = pkParts();
  const expired = 2000 + yy < now.year || (2000 + yy === now.year && mm < now.month);
  const fail = (reason: Decision['reason']): Decision => ({
    approved: false,
    reason,
    brand,
    last4,
  });
  if (!/^\d{12,19}$/.test(digits) || dto.cardholderName.trim().length < 2)
    return fail('INVALID_DETAILS');
  if (expired) return fail('EXPIRED_CARD');
  if (digits === INSUFFICIENT_FUNDS_CARD) return fail('INSUFFICIENT_FUNDS');
  if (!APPROVE_CARDS.includes(digits)) return fail('INVALID_CARD');
  return { approved: true, reason: 'APPROVED', brand, last4 };
}
