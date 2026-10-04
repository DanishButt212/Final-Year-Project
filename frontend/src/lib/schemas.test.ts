import { describe, expect, it } from 'vitest';
import { formatDate, formatPkr } from './format';
import { CNIC_REGEX, PHONE_REGEX, registerSchema } from './schemas';

describe('format rules', () => {
  it('accepts the CNIC format 12345-1234567-1 only', () => {
    expect(CNIC_REGEX.test('36302-1234567-1')).toBe(true);
    for (const bad of ['3630212345671', '36302-123456-1', '36302-1234567-12', 'abcde-1234567-1']) {
      expect(CNIC_REGEX.test(bad)).toBe(false);
    }
  });

  it('accepts the phone format +92 3XX XXXXXXX only', () => {
    expect(PHONE_REGEX.test('+92 300 1234567')).toBe(true);
    for (const bad of ['03001234567', '+923001234567', '+92 200 1234567', '+92 300 123456']) {
      expect(PHONE_REGEX.test(bad)).toBe(false);
    }
  });

  it('formats dates as DD-MM-YYYY and money as PKR', () => {
    expect(formatDate(new Date(2026, 9, 3))).toBe('03-10-2026');
    expect(formatDate(null)).toBe('—');
    expect(formatPkr(12500)).toBe('PKR 12,500');
  });
});

describe('registerSchema', () => {
  const valid = {
    role: 'LITIGANT',
    firstName: 'Ayesha',
    lastName: 'Siddiqui',
    cnic: '36302-1111111-1',
    email: 'ayesha@example.test',
    phone: '+92 300 1111111',
    password: 'Passw0rdTest',
    confirmPassword: 'Passw0rdTest',
  };

  it('accepts valid input', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('does not allow privileged roles', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });

  it('rejects mismatching passwords on the confirm field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'Other1Password' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['confirmPassword']);
  });
});
