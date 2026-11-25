import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthorizeDto } from './fees.dto';
import { decide } from './payment-gateway';

const wallet = (
  mobileNumber: string,
  method: 'MOCK_JAZZCASH' | 'MOCK_EASYPAISA' = 'MOCK_JAZZCASH',
) =>
  plainToInstance(AuthorizeDto, {
    paymentId: '11111111-1111-4111-8111-111111111111',
    method,
    mobileNumber,
  });

describe.each(['MOCK_JAZZCASH', 'MOCK_EASYPAISA'] as const)('simulated %s gateway', (method) => {
  it('accepts wallet details without requesting card credentials', async () => {
    expect(await validate(wallet('03000000000', method))).toHaveLength(0);
    expect(decide(wallet('03000000000', method))).toEqual({
      approved: true,
      reason: 'APPROVED',
      brand: null,
      last4: null,
    });
  });

  it('declines the documented insufficient-funds number', () => {
    expect(decide(wallet('03000000001', method))).toMatchObject({
      approved: false,
      reason: 'INSUFFICIENT_FUNDS',
    });
  });

  it('does not approve arbitrary wallet numbers', () => {
    expect(decide(wallet('03001234567', method))).toMatchObject({
      approved: false,
      reason: 'INVALID_DETAILS',
    });
  });

  it.each(['', '1234', '04000000000', '030000000000', '+923000000000'])(
    'rejects invalid mobile number %s',
    async (number) => {
      expect(
        (await validate(wallet(number, method))).some((e) => e.property === 'mobileNumber'),
      ).toBe(true);
    },
  );

  it('requires the mobile number and rejects unsupported payment methods', async () => {
    const missing = plainToInstance(AuthorizeDto, {
      paymentId: wallet('').paymentId,
      method,
    });
    expect((await validate(missing)).some((e) => e.property === 'mobileNumber')).toBe(true);
    expect(
      (await validate(plainToInstance(AuthorizeDto, { ...missing, method: 'REAL_JAZZCASH' }))).some(
        (e) => e.property === 'method',
      ),
    ).toBe(true);
  });

  it('continues validating and approving existing card submissions without a method', async () => {
    const card = plainToInstance(AuthorizeDto, {
      paymentId: wallet('').paymentId,
      cardholderName: 'Demo User',
      cardNumber: '4242 4242 4242 4242',
      expiry: '12/99',
      cvv: '123',
    });
    expect(await validate(card)).toHaveLength(0);
    expect(decide(card)).toMatchObject({ approved: true, brand: 'VISA', last4: '4242' });
    expect(
      (await validate(plainToInstance(AuthorizeDto, { paymentId: card.paymentId }))).some(
        (e) => e.property === 'cardNumber',
      ),
    ).toBe(true);
  });
});

const bank = (transferReference?: string) =>
  plainToInstance(AuthorizeDto, {
    paymentId: '11111111-1111-4111-8111-111111111111',
    method: 'MOCK_BANK_TRANSFER',
    transferReference,
  });
describe('simulated bank transfer', () => {
  it('accepts the demo reference without card or wallet credentials', async () => {
    expect(await validate(bank('DEMO-BANK-APPROVED'))).toHaveLength(0);
    expect(decide(bank('DEMO-BANK-APPROVED'))).toEqual({
      approved: true,
      reason: 'APPROVED',
      brand: null,
      last4: null,
    });
  });
  it('declines insufficient funds and unrecognized references', () => {
    expect(decide(bank('DEMO-BANK-DECLINED'))).toMatchObject({
      approved: false,
      reason: 'INSUFFICIENT_FUNDS',
    });
    expect(decide(bank('OTHER-REFERENCE'))).toMatchObject({
      approved: false,
      reason: 'INVALID_DETAILS',
    });
  });
  it.each([undefined, '', '123', 'BANK REF', 'A'.repeat(41)])(
    'rejects invalid reference %s',
    async (reference) => {
      expect(
        (await validate(bank(reference))).some((e) => e.property === 'transferReference'),
      ).toBe(true);
    },
  );
});
