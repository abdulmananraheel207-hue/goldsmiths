import { describe, it, expect } from 'vitest';
import { formatRs, formatCnicInput, isValidCnic, formatPhoneInput, isValidPkMobile, cleanDecimal, formatDate } from './format.js';
import { calcTotals } from '@shared/saleCalc.js';

describe('format helpers', () => {
  it('formats rupees like "Rs 248,854"', () => {
    expect(formatRs(248854)).toBe('Rs 248,854');
    expect(formatRs('35208.65')).toBe('Rs 35,208.65');
    expect(formatRs(-500)).toBe('−Rs 500');
  });

  it('auto-formats CNIC and mobile numbers', () => {
    expect(formatCnicInput('3520212345671')).toBe('35202-1234567-1');
    expect(isValidCnic('35202-1234567-1')).toBe(true);
    expect(isValidCnic('35202-123')).toBe(false);
    expect(formatPhoneInput('03001234567')).toBe('0300-1234567');
    expect(isValidPkMobile('0300-1234567')).toBe(true);
    expect(isValidPkMobile('0400-1234567')).toBe(false);
  });

  it('cleans decimal input', () => {
    expect(cleanDecimal('12a.3.45', 2)).toBe('12.34');
    expect(cleanDecimal('6.7209', 3)).toBe('6.720');
  });

  it('formats dates in plain words', () => {
    expect(formatDate('2026-11-12')).toBe('12 Nov 2026');
  });

  it('uses the shared sale maths from the server', () => {
    const t = calcTotals({ lines: [{ weight_grams: '1', quantity: 1, rate_per_gram: '1000' }], tax_percent: '3', pos_service_fee: '1' });
    expect(t.total_amount).toBe('1031.00');
  });
});
