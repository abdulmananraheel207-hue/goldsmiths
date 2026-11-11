import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '../src/db.js';
import { createSale, voidSale, getSaleFull } from '../src/services/sales.js';
import { applyDailyRate, getCurrentRate } from '../src/services/rates.js';
import { customerBalance } from '../src/services/ledger.js';
import { clearSettingsCache } from '../src/services/settings.js';

const item = (tag) => db('items').where({ tag }).first();
const customer = (name) => db('customers').where({ name }).first();
const gramRate = async (tag) =>
  (await db('items as i').join('categories as c', 'c.id', 'i.category_id').where('i.tag', tag).select('c.price_per_gram').first())
    .price_per_gram;

beforeEach(async () => {
  clearSettingsCache();
  await db.seed.run();
});
afterAll(() => db.destroy());

describe('daily rate', () => {
  it('updates every karat at once and records history', async () => {
    await applyDailyRate({ price24k: '480000' });
    const current = await getCurrentRate();
    expect(current.price_24k_per_tola).toBe('480000.0000');
    expect(current.is_today).toBe(true);
    const k22 = await db('categories').where({ karat: 22 }).first();
    expect(k22.price_per_tola).toBe('440000.0000'); // 22/24 × 480000
    const history = await db('gold_rate_history').count({ n: '*' }).first();
    expect(Number(history.n)).toBe(2);
  });

  it('can keep manually set karats unchanged', async () => {
    await db('categories').where({ karat: 21 }).update({ price_per_tola: '123456.0000', is_manual_override: true });
    await applyDailyRate({ price24k: '480000', keepManual: true });
    const k21 = await db('categories').where({ karat: 21 }).first();
    expect(k21.price_per_tola).toBe('123456.0000');
    expect(Boolean(k21.is_manual_override)).toBe(true);
    const latest = await getCurrentRate();
    expect(latest.applied_to_all).toBe(false);

    await applyDailyRate({ price24k: '480000', keepManual: false });
    const after = await db('categories').where({ karat: 21 }).first();
    expect(after.price_per_tola).toBe('420000.0000');
    expect(Boolean(after.is_manual_override)).toBe(false);
  });
});

describe('sales', () => {
  async function sellChain(extra = {}) {
    const asif = await customer('Muhammad Asif');
    const chain = await item('CH0001');
    return createSale({
      customer_id: asif.id,
      payment_method: 'cash',
      discount: '0',
      cash_received: '50000',
      lines: [{ item_id: chain.id, quantity: 1, wastage_type: 'grams', wastage_value: '0', rate_per_gram: await gramRate('CH0001'), making_charges: '5000' }],
      ...extra,
    });
  }

  it('snapshots the rate: changing the daily price never changes an existing sale', async () => {
    const { id } = await sellChain();
    const before = await getSaleFull(id);
    await applyDailyRate({ price24k: '999999' });
    const after = await getSaleFull(id);
    expect(after.gold_rate_24k_snapshot).toBe(before.gold_rate_24k_snapshot);
    expect(after.total_amount).toBe(before.total_amount);
    expect(after.lines[0].rate_per_gram_snapshot).toBe(before.lines[0].rate_per_gram_snapshot);
    expect(after.lines[0].line_total).toBe(before.lines[0].line_total);
    // and new sales use the new rate
    const { id: id2 } = await sellChain({ lines: [{ item_id: (await item('CH0001')).id, quantity: 1, rate_per_gram: await gramRate('CH0001') }] });
    const s2 = await getSaleFull(id2);
    expect(s2.gold_rate_24k_snapshot).toBe('999999.0000');
  });

  it('decrements stock, and voiding restores it and reverses the balance', async () => {
    const asif = await customer('Muhammad Asif');
    const qtyBefore = (await item('CH0001')).quantity;
    const balBefore = await customerBalance(asif.id);

    const { id } = await sellChain();
    const sale = await db('sales').where({ id }).first();
    expect((await item('CH0001')).quantity).toBe(qtyBefore - 1);
    expect(Number(await customerBalance(asif.id))).toBeCloseTo(Number(balBefore) + Number(sale.balance), 2);

    await voidSale(id, 'Customer changed mind');
    expect((await item('CH0001')).quantity).toBe(qtyBefore);
    expect(await customerBalance(asif.id)).toBe(balBefore);
    const voided = await db('sales').where({ id }).first();
    expect(voided.status).toBe('void');
    const log = await db('audit_log').where({ action: 'void', entity_id: id }).first();
    expect(log).toBeTruthy();
    await expect(voidSale(id, 'again')).rejects.toThrow(/already/);
  });

  it('rejects selling more than in stock (stock never goes negative)', async () => {
    const nosePin = await item('NO0001'); // seeded with quantity 0
    const asif = await customer('Muhammad Asif');
    await expect(
      createSale({ customer_id: asif.id, lines: [{ item_id: nosePin.id, quantity: 1, rate_per_gram: '1000' }] }),
    ).rejects.toThrow(/cannot be sold/);
    const ring = await item('RI0002'); // quantity 1
    await expect(
      createSale({ customer_id: asif.id, lines: [{ item_id: ring.id, quantity: 2, rate_per_gram: '1000' }] }),
    ).rejects.toThrow();
    expect((await item('RI0002')).quantity).toBe(1);
  });

  it('requires full payment from the Walk-in customer', async () => {
    const walkIn = await db('customers').where({ is_walk_in: true }).first();
    const ring = await item('RI0001');
    await expect(
      createSale({ customer_id: walkIn.id, cash_received: '10', lines: [{ item_id: ring.id, quantity: 1, rate_per_gram: '30000' }] }),
    ).rejects.toThrow(/full amount/);
  });

  it('invoice numbers are sequential and never reused after a void', async () => {
    const a = await sellChain();
    await voidSale(a.id, 'test');
    const b = await sellChain();
    const num = (s) => Number(s.replace(/\D/g, ''));
    expect(num(b.invoice_number)).toBe(num(a.invoice_number) + 1);
  });

  it('records a negative balance as change, not as customer credit', async () => {
    const asif = await customer('Muhammad Asif');
    const balBefore = await customerBalance(asif.id);
    const { id } = await sellChain({ cash_received: '10000000' });
    const sale = await db('sales').where({ id }).first();
    expect(Number(sale.balance)).toBeLessThan(0);
    expect(await customerBalance(asif.id)).toBe(balBefore);
  });
});
