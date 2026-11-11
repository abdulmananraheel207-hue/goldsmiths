/**
 * Sale line and totals maths. Pure functions, shared by the server (authoritative)
 * and the web client (live preview while typing). All values are returned as
 * fixed-decimal strings so no float rounding errors creep in.
 *
 * Line:
 *   wastage_grams = wastage_value   (wastage is always entered in grams)
 *   gross_weight  = weight + wastage_grams
 *   line_total    = gross_weight × rate_per_gram × qty + making + other_stone − gold_received
 *
 * Totals:
 *   subtotal       = Σ line_total
 *   taxable        = subtotal − discount
 *   tax_amount     = taxable × tax% / 100
 *   card_fee       = (payment = card) ? (taxable + tax) × card_fee% / 100 : 0
 *   total_amount   = taxable + tax + pos_service_fee + card_fee
 *   balance        = total − cash_received  (positive = customer owes, negative = change to return)
 */
import Decimal from 'decimal.js';

const D = (v) => {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};
const money = (d) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const grams = (d) => d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

export function calcLine(line) {
  const weight = D(line.weight_grams);
  const wastageValue = D(line.wastage_value);
  const qty = D(line.quantity || 0);
  const rate = D(line.rate_per_gram);

  const wastageGrams = grams(wastageValue);
  const grossWeight = grams(weight.plus(wastageGrams));
  const goldValue = grossWeight.times(rate).times(qty);
  const lineTotal = money(
    goldValue
      .plus(D(line.making_charges))
      .plus(D(line.other_stone_charges))
      .minus(D(line.gold_received_value)),
  );

  return {
    wastage_grams: wastageGrams.toFixed(3),
    gross_weight: grossWeight.toFixed(3),
    gold_value: money(goldValue).toFixed(2),
    line_total: lineTotal.toFixed(2),
  };
}

export function calcTotals({
  lines = [],
  discount = 0,
  tax_percent = 0,
  pos_service_fee = 0,
  card_fee_percent = 0,
  payment_method = 'cash',
  cash_received = 0,
}) {
  const subtotal = money(lines.reduce((sum, l) => sum.plus(D(calcLine(l).line_total)), new Decimal(0)));
  const disc = money(D(discount));
  const taxable = money(subtotal.minus(disc));
  const tax = money(taxable.times(D(tax_percent)).div(100));
  const cardFee = payment_method === 'card' ? money(taxable.plus(tax).times(D(card_fee_percent)).div(100)) : new Decimal(0);
  const pos = money(D(pos_service_fee));
  const total = money(taxable.plus(tax).plus(pos).plus(cardFee));
  const received = money(D(cash_received));
  const balance = money(total.minus(received));

  return {
    subtotal: subtotal.toFixed(2),
    discount: disc.toFixed(2),
    taxable: taxable.toFixed(2),
    tax_percent: D(tax_percent).toFixed(2),
    tax_amount: tax.toFixed(2),
    pos_service_fee: pos.toFixed(2),
    card_fee: cardFee.toFixed(2),
    total_amount: total.toFixed(2),
    cash_received: received.toFixed(2),
    balance: balance.toFixed(2),
    amount_owed: balance.gt(0) ? balance.toFixed(2) : '0.00',
    change_to_return: balance.lt(0) ? balance.neg().toFixed(2) : '0.00',
  };
}
