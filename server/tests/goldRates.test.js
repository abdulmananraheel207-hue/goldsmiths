import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  DEFAULT_GRAMS_PER_TOLA,
  STANDARD_KARATS,
  karatFactor,
  ratePerTola,
  ratePerGram,
  computeKaratRates,
  round2,
  gramPriceFromTola,
  tolaPriceFromGram,
} from '../src/services/goldRates.js';

const GPT = DEFAULT_GRAMS_PER_TOLA; // 11.6638

describe('gold rate maths — reference test inputs (24K = 448000 per tola)', () => {
  // These are TEST INPUTS only. The app never hard-codes a price.
  const price = 448000;

  it('22K', () => {
    expect(round2(ratePerTola(22, price))).toBe('410666.67');
    expect(round2(ratePerGram(22, price, GPT))).toBe('35208.65');
  });

  it('18K', () => {
    expect(round2(ratePerTola(18, price))).toBe('336000.00');
    expect(round2(ratePerGram(18, price, GPT))).toBe('28807.08');
  });

  it('1K', () => {
    expect(round2(ratePerTola(1, price))).toBe('18666.67');
    expect(round2(ratePerGram(1, price, GPT))).toBe('1600.39');
  });
});

describe.each([400000, 448000, 520000, '387654.32', 1])('formulas hold for a 24K price of %s', (price) => {
  it.each(STANDARD_KARATS)('%iK = karat/24 × price, ÷ grams per tola', (k) => {
    const expectedTola = new Decimal(k).div(24).times(price);
    const expectedGram = expectedTola.div(GPT);
    expect(ratePerTola(k, price).eq(expectedTola)).toBe(true);
    expect(ratePerGram(k, price, GPT).eq(expectedGram)).toBe(true);
  });

  it('24K per tola equals the entered price exactly', () => {
    expect(ratePerTola(24, price).eq(new Decimal(price))).toBe(true);
  });

  it('a higher karat always costs more', () => {
    const rates = computeKaratRates(price, GPT);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i - 1].perTola.gt(rates[i].perTola)).toBe(true);
    }
  });
});

describe('helpers', () => {
  it('factor is karat / 24', () => {
    expect(karatFactor(12).toString()).toBe('0.5');
    expect(karatFactor(24).toString()).toBe('1');
  });

  it('respects a custom grams-per-tola setting', () => {
    const custom = '11.664';
    expect(ratePerGram(24, 400000, custom).eq(new Decimal(400000).div(custom))).toBe(true);
  });

  it('gram ↔ tola conversion round-trips', () => {
    const tola = '410666.6667';
    expect(tolaPriceFromGram(gramPriceFromTola(tola, GPT), GPT).toDecimalPlaces(4).toString()).toBe(tola);
  });

  it('computeKaratRates returns all 13 standard karats', () => {
    const rates = computeKaratRates(450000, GPT);
    expect(rates.map((r) => r.karat)).toEqual(STANDARD_KARATS);
    expect(rates[0].name).toBe('24K');
  });

  it('rejects invalid input', () => {
    expect(() => ratePerTola(22, 0)).toThrow();
    expect(() => ratePerTola(22, -5)).toThrow();
    expect(() => ratePerTola(25, 400000)).toThrow();
    expect(() => ratePerGram(22, 400000, 0)).toThrow();
  });

  it('keeps full precision internally (no early rounding)', () => {
    // 22/24 × 448000 = 410666.666… ; rounding to 2 dp first would give a different gram rate
    const exact = ratePerGram(22, 448000, GPT);
    const earlyRounded = new Decimal('410666.67').div(GPT);
    expect(exact.eq(earlyRounded)).toBe(false);
  });
});
