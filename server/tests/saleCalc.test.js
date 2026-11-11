import { describe, it, expect } from 'vitest';
import { calcLine, calcTotals } from '../src/services/saleCalc.js';

const baseLine = {
  weight_grams: '6.720',
  wastage_type: 'grams',
  wastage_value: '0',
  quantity: 1,
  rate_per_gram: '35209',
  making_charges: '5000',
  other_stone_charges: '0',
  gold_received_value: '0',
};

describe('calcLine', () => {
  it('spec illustration: 6.720 g × 35,209 + 5,000 making ≈ 241,605', () => {
    const r = calcLine(baseLine);
    expect(r.gross_weight).toBe('6.720');
    expect(r.line_total).toBe('241604.48');
    expect(Math.round(Number(r.line_total))).toBe(241604); // spec rounds to 241,605 for illustration
  });

  it('adds wastage in grams to the gross weight', () => {
    const r = calcLine({ ...baseLine, wastage_value: '0.280' });
    expect(r.wastage_grams).toBe('0.280');
    expect(r.gross_weight).toBe('7.000');
    expect(r.line_total).toBe(String((7 * 35209 + 5000).toFixed(2)));
  });

  it('wastage is always taken as grams, whatever type is sent', () => {
    const r = calcLine({ ...baseLine, weight_grams: '10', wastage_type: 'karat_wise', wastage_value: '0.5' });
    expect(r.wastage_grams).toBe('0.500');
    expect(r.gross_weight).toBe('10.500');
  });

  it('multiplies by quantity and deducts old gold received', () => {
    const r = calcLine({
      ...baseLine,
      weight_grams: '2',
      quantity: 3,
      rate_per_gram: '10000',
      making_charges: '1000',
      other_stone_charges: '500',
      gold_received_value: '20000',
    });
    // 2 × 10000 × 3 + 1000 + 500 − 20000
    expect(r.line_total).toBe('41500.00');
  });

  it('treats blank inputs as zero', () => {
    const r = calcLine({ weight_grams: '1', quantity: 1, rate_per_gram: '100', making_charges: '' });
    expect(r.line_total).toBe('100.00');
  });
});

describe('calcTotals', () => {
  const lines = [{ ...baseLine, weight_grams: '10', rate_per_gram: '10000', making_charges: '0' }]; // 100,000

  it('applies tax after discount, plus POS fee', () => {
    const t = calcTotals({ lines, discount: '2000', tax_percent: '3', pos_service_fee: '1', cash_received: '0' });
    expect(t.subtotal).toBe('100000.00');
    expect(t.taxable).toBe('98000.00');
    expect(t.tax_amount).toBe('2940.00');
    expect(t.total_amount).toBe('100941.00');
    expect(t.card_fee).toBe('0.00');
  });

  it('adds card fee only when paying by card', () => {
    const args = { lines, discount: '0', tax_percent: '3', pos_service_fee: '1', card_fee_percent: '2' };
    expect(calcTotals({ ...args, payment_method: 'cash' }).card_fee).toBe('0.00');
    const card = calcTotals({ ...args, payment_method: 'card' });
    expect(card.card_fee).toBe('2060.00'); // 2% of 103,000
    expect(card.total_amount).toBe('105061.00');
  });

  it('positive balance = customer owes', () => {
    const t = calcTotals({ lines, tax_percent: '0', pos_service_fee: '0', cash_received: '60000' });
    expect(t.balance).toBe('40000.00');
    expect(t.amount_owed).toBe('40000.00');
    expect(t.change_to_return).toBe('0.00');
  });

  it('negative balance = change to return', () => {
    const t = calcTotals({ lines, tax_percent: '0', pos_service_fee: '0', cash_received: '100500' });
    expect(t.balance).toBe('-500.00');
    expect(t.amount_owed).toBe('0.00');
    expect(t.change_to_return).toBe('500.00');
  });

  it('avoids float errors on money', () => {
    const t = calcTotals({
      lines: [{ weight_grams: '1', quantity: 1, rate_per_gram: '0.1' }, { weight_grams: '1', quantity: 1, rate_per_gram: '0.2' }],
      tax_percent: '0',
      pos_service_fee: '0',
    });
    expect(t.subtotal).toBe('0.30');
  });
});
