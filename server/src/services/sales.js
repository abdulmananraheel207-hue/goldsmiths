import Decimal from 'decimal.js';
import { db } from '../db.js';
import { getSettings } from './settings.js';
import { getCurrentRate } from './rates.js';
import { calcLine, calcTotals } from './saleCalc.js';
import { tolaPriceFromGram, round4 } from './goldRates.js';
import { audit } from './audit.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';

/** Next invoice number. Uses a locked counter row so numbers are gap-free and never reused. */
export async function nextInvoiceNumber(trx, prefix) {
  await trx.raw('INSERT IGNORE INTO counters (name, value) VALUES (?, 0)', ['invoice']);
  const row = await trx('counters').where({ name: 'invoice' }).forUpdate().first();
  const next = Number(row.value) + 1;
  await trx('counters').where({ name: 'invoice' }).update({ value: next });
  return `${prefix || ''}${String(next).padStart(6, '0')}`;
}

/**
 * Create a sale in ONE transaction: validates stock, snapshots rates,
 * decrements stock, generates the invoice number, audits and queues the tax upload.
 * `opts.saleDate` / `opts.createdAt` / `opts.db` are only used by the seed script.
 */
export async function createSale(input, opts = {}) {
  return (opts.db || db).transaction(async (trx) => {
    const settings = await getSettings(trx);
    const gpt = settings.grams_per_tola;

    const customer = await trx('customers').where({ id: input.customer_id }).whereNull('deleted_at').first();
    if (!customer) throw badRequest('Please choose a customer.', { customer_id: 'Customer not found' });
    if (customer.status !== 'active') throw badRequest('This customer is marked inactive. Please activate them first.');

    const rate = await getCurrentRate(trx);
    if (!rate) throw badRequest("Today's gold price has not been set yet. Please add it on the Categories page first.");

    if (!input.lines?.length) throw badRequest('Please add at least one item to the sale.');

    // Lock all items first and check stock (same item may appear on several rows).
    const itemIds = [...new Set(input.lines.map((l) => l.item_id))];
    const items = await trx('items as i')
      .join('categories as c', 'c.id', 'i.category_id')
      .whereIn('i.id', itemIds)
      .select('i.*', 'c.name as category_name', 'c.karat', 'c.price_per_gram', 'c.price_per_tola')
      .forUpdate();
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const wanted = {};
    const lineErrors = {};

    input.lines.forEach((l, idx) => {
      const item = byId[l.item_id];
      if (!item || item.deleted_at) {
        lineErrors[`lines.${idx}.item_id`] = 'This item no longer exists';
        return;
      }
      if (item.status !== 'active') lineErrors[`lines.${idx}.item_id`] = `${item.tag} is marked inactive`;
      wanted[item.id] = (wanted[item.id] || 0) + Number(l.quantity);
    });
    for (const [id, qty] of Object.entries(wanted)) {
      const item = byId[id];
      if (item && Number(item.quantity) < qty) {
        const idx = input.lines.findIndex((l) => String(l.item_id) === String(id));
        lineErrors[`lines.${idx}.quantity`] =
          Number(item.quantity) === 0
            ? `${item.tag} is out of stock`
            : `Only ${item.quantity} of ${item.tag} left in stock`;
      }
    }
    if (Object.keys(lineErrors).length) {
      throw conflict('Some items cannot be sold. Please check the highlighted rows.', lineErrors);
    }

    // Build lines with rate snapshots.
    const lines = input.lines.map((l) => {
      const item = byId[l.item_id];
      const ratePerGram = l.rate_per_gram !== undefined && l.rate_per_gram !== '' ? l.rate_per_gram : item.price_per_gram;
      const lineInput = {
        weight_grams: l.weight_grams ?? item.weight_grams,
        wastage_type: 'grams', // wastage is always entered in grams
        wastage_value: l.wastage_value || '0',
        quantity: l.quantity,
        rate_per_gram: ratePerGram,
        making_charges: l.making_charges || '0',
        other_stone_charges: l.other_stone_charges || '0',
        gold_received_value: l.gold_received_value || '0',
      };
      const calc = calcLine(lineInput);
      return {
        item,
        lineInput,
        row: {
          item_id: item.id,
          item_tag: item.tag,
          item_name: item.name,
          category_id: item.category_id,
          category_name: item.category_name,
          karat: item.karat,
          weight_grams: new Decimal(lineInput.weight_grams).toFixed(3),
          wastage_type: lineInput.wastage_type,
          wastage_value: new Decimal(lineInput.wastage_value).toFixed(3),
          wastage_grams: calc.wastage_grams,
          gross_weight: calc.gross_weight,
          quantity: Number(l.quantity),
          rate_per_gram_snapshot: round4(ratePerGram),
          rate_per_tola_snapshot: round4(tolaPriceFromGram(ratePerGram, gpt)),
          making_charges: new Decimal(lineInput.making_charges).toFixed(2),
          other_stone_charges: new Decimal(lineInput.other_stone_charges).toFixed(2),
          gold_received_value: new Decimal(lineInput.gold_received_value).toFixed(2),
          line_total: calc.line_total,
        },
      };
    });

    const totals = calcTotals({
      lines: lines.map((l) => l.lineInput),
      discount: input.discount,
      tax_percent: settings.tax_percent,
      pos_service_fee: settings.pos_service_fee,
      card_fee_percent: settings.card_fee_percent,
      payment_method: input.payment_method,
      cash_received: input.cash_received,
    });

    if (new Decimal(totals.subtotal).lt(0)) {
      throw badRequest('The sub total cannot be below zero. Please check the Gold Received amounts.');
    }
    if (new Decimal(totals.discount).gt(totals.subtotal)) {
      throw badRequest('The discount cannot be more than the sub total.', { discount: 'Discount is too large' });
    }
    if (customer.is_walk_in && new Decimal(totals.balance).gt(0)) {
      throw badRequest(
        `A walk-in customer must pay the full amount (Rs ${totals.total_amount}). Please choose or add a registered customer to sell on credit.`,
        { cash_received: 'Full payment is needed for a walk-in customer' },
      );
    }

    const invoiceNumber = await nextInvoiceNumber(trx, settings.invoice_prefix);
    const saleRow = {
      invoice_number: invoiceNumber,
      sale_date: opts.saleDate || trx.raw('CURDATE()'),
      customer_id: customer.id,
      payment_method: input.payment_method || 'cash',
      bill_no: input.bill_no || null,
      remarks: input.remarks || null,
      gold_rate_24k_snapshot: rate.price_24k_per_tola,
      grams_per_tola_snapshot: new Decimal(gpt).toFixed(4),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax_percent: totals.tax_percent,
      tax_amount: totals.tax_amount,
      pos_service_fee: totals.pos_service_fee,
      card_fee: totals.card_fee,
      total_amount: totals.total_amount,
      cash_received: totals.cash_received,
      balance: totals.balance,
      status: 'active',
      tax_status: 'pending',
    };
    if (opts.createdAt) saleRow.created_at = opts.createdAt;
    const [saleId] = await trx('sales').insert(saleRow);

    for (const l of lines) {
      await trx('sale_items').insert({ ...l.row, sale_id: saleId });
    }
    for (const [id, qty] of Object.entries(wanted)) {
      const updated = await trx('items')
        .where({ id })
        .andWhere('quantity', '>=', qty)
        .decrement('quantity', qty);
      if (!updated) throw conflict('Stock changed while saving. Please try again.');
    }

    await trx('tax_upload_queue').insert({ sale_id: saleId, status: 'pending' });
    await audit(trx, 'create', 'sale', saleId, {
      invoice_number: invoiceNumber,
      customer_id: customer.id,
      total_amount: totals.total_amount,
      gold_rate_24k_snapshot: rate.price_24k_per_tola,
      items: lines.map((l) => ({ tag: l.row.item_tag, qty: l.row.quantity })),
    });

    return { id: saleId, invoice_number: invoiceNumber };
  });
}

/** Void a sale: restores stock, reverses the customer balance, keeps the invoice number. */
export async function voidSale(saleId, reason) {
  return db.transaction(async (trx) => {
    const sale = await trx('sales').where({ id: saleId }).forUpdate().first();
    if (!sale) throw notFound('Sale not found.');
    if (sale.status === 'void') throw conflict('This sale has already been cancelled.');

    const lines = await trx('sale_items').where({ sale_id: saleId });
    for (const l of lines) {
      if (l.item_id) await trx('items').where({ id: l.item_id }).increment('quantity', l.quantity);
    }
    await trx('sales').where({ id: saleId }).update({ status: 'void', void_reason: reason, voided_at: trx.fn.now() });
    await trx('tax_upload_queue')
      .where({ sale_id: saleId })
      .whereIn('status', ['pending', 'processing'])
      .update({ status: 'cancelled' });
    await audit(trx, 'void', 'sale', saleId, {
      invoice_number: sale.invoice_number,
      reason,
      total_amount: sale.total_amount,
      balance_reversed: sale.balance,
      stock_restored: lines.map((l) => ({ tag: l.item_tag, qty: l.quantity })),
    });
    return { id: saleId };
  });
}

/** Sale with lines, customer and payments, for the invoice and tax upload. */
export async function getSaleFull(saleId, conn = db) {
  const sale = await conn('sales').where({ id: saleId }).first();
  if (!sale) return null;
  const lines = await conn('sale_items').where({ sale_id: saleId }).orderBy('id');
  const customer = await conn('customers')
    .where({ id: sale.customer_id })
    .select('id', 'name', 'cnic', 'phone', 'email', 'address', 'is_walk_in')
    .first();
  const payments = await conn('customer_payments').where({ sale_id: saleId }).orderBy('paid_at');
  if (typeof sale.tax_response === 'string') {
    try {
      sale.tax_response = JSON.parse(sale.tax_response);
    } catch {
      /* leave as text */
    }
  }
  return { ...sale, lines, customer, payments };
}
