/**
 * Gold rate maths — the SINGLE source of truth for karat prices.
 *
 * NEVER hard-code a gold price anywhere. The 24K price per tola is data entered
 * by the shop each day; every karat's price is derived from it here.
 *
 *   factor        = karat / 24
 *   rate_per_tola = factor × price_24k_per_tola
 *   rate_per_gram = rate_per_tola / grams_per_tola
 *
 * Full precision is kept internally (Decimal). Round only for display/storage.
 * This file has no server-only dependencies so the web client imports it too.
 */
import Decimal from 'decimal.js';

/** Default only; the live value is the `grams_per_tola` setting. */
export const DEFAULT_GRAMS_PER_TOLA = '11.6638';

/** Karats seeded as standard categories. */
export const STANDARD_KARATS = [24, 23, 22, 21, 20, 18, 14, 12, 10, 4, 3, 2, 1];

const D = (v) => new Decimal(v === null || v === undefined || v === '' ? 0 : v);

function assertPositive(value, label) {
  let d;
  try {
    d = D(value);
  } catch {
    throw new Error(`${label} must be a number`);
  }
  if (!d.isFinite() || d.lte(0)) throw new Error(`${label} must be greater than zero`);
  return d;
}

export function karatFactor(karat) {
  const k = assertPositive(karat, 'Karat');
  if (k.gt(24)) throw new Error('Karat cannot be more than 24');
  return k.div(24);
}

/** Price of one tola of `karat` gold, given today's 24K price per tola. Returns Decimal. */
export function ratePerTola(karat, price24kPerTola) {
  return karatFactor(karat).times(assertPositive(price24kPerTola, '24K price'));
}

/** Price of one gram of `karat` gold. Returns Decimal. */
export function ratePerGram(karat, price24kPerTola, gramsPerTola = DEFAULT_GRAMS_PER_TOLA) {
  return ratePerTola(karat, price24kPerTola).div(assertPositive(gramsPerTola, 'Grams per tola'));
}

/** Convert a tola price into a gram price. Returns Decimal. */
export function gramPriceFromTola(pricePerTola, gramsPerTola = DEFAULT_GRAMS_PER_TOLA) {
  return D(pricePerTola).div(assertPositive(gramsPerTola, 'Grams per tola'));
}

/** Convert a gram price into a tola price. Returns Decimal. */
export function tolaPriceFromGram(pricePerGram, gramsPerTola = DEFAULT_GRAMS_PER_TOLA) {
  return D(pricePerGram).times(assertPositive(gramsPerTola, 'Grams per tola'));
}

/**
 * Rates for a list of karats.
 * @returns {{karat:number,name:string,factor:Decimal,perTola:Decimal,perGram:Decimal}[]}
 */
export function computeKaratRates(price24kPerTola, gramsPerTola = DEFAULT_GRAMS_PER_TOLA, karats = STANDARD_KARATS) {
  return karats.map((karat) => ({
    karat,
    name: `${karat}K`,
    factor: karatFactor(karat),
    perTola: ratePerTola(karat, price24kPerTola),
    perGram: ratePerGram(karat, price24kPerTola, gramsPerTola),
  }));
}

/** Round to 2 decimals for display (half-up). Returns string. */
export function round2(value) {
  return D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Round to 4 decimals for storage of rates. Returns string. */
export function round4(value) {
  return D(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

/** Factor rounded for the DECIMAL(10,8) column (display/reference only; maths uses karat/24). */
export function factor8(karat) {
  return karatFactor(karat).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8);
}
