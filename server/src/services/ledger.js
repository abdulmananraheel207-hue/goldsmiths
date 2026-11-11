/**
 * Customer balance is ALWAYS derived from ledger data:
 *   balance = opening_balance + Σ(unpaid balances of active sales) − Σ(payments received)
 * A negative sale balance (change returned) is never added to the customer.
 */
import Decimal from 'decimal.js';
import { db } from '../db.js';

/** SQL expression for the balance of the customer aliased as `c`. */
export const BALANCE_SQL = `(
    c.opening_balance
    + COALESCE((SELECT SUM(s.balance) FROM sales s WHERE s.customer_id = c.id AND s.status = 'active' AND s.balance > 0), 0)
    - COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.customer_id = c.id), 0)
  )`;

export async function customerBalance(customerId, trx) {
  const conn = trx || db;
  const row = await conn('customers as c')
    .select(conn.raw(`${BALANCE_SQL} AS balance`))
    .where('c.id', customerId)
    .first();
  return row ? new Decimal(row.balance).toFixed(2) : '0.00';
}

/** Full ledger: sales with paid/remaining per invoice, and payments. */
export async function customerLedger(customerId) {
  const sales = await db('sales')
    .where({ customer_id: customerId })
    .select(
      'id',
      'invoice_number',
      'sale_date',
      'created_at',
      'total_amount',
      'cash_received',
      'balance',
      'status',
      'payment_method',
    )
    .orderBy('id', 'desc');

  const payments = await db('customer_payments as p')
    .leftJoin('sales as s', 's.id', 'p.sale_id')
    .where('p.customer_id', customerId)
    .select('p.*', 's.invoice_number')
    .orderBy('p.paid_at', 'desc')
    .orderBy('p.id', 'desc');

  const paidBySale = {};
  for (const p of payments) {
    if (p.sale_id) paidBySale[p.sale_id] = new Decimal(paidBySale[p.sale_id] || 0).plus(p.amount);
  }

  const saleRows = sales.map((s) => {
    const total = new Decimal(s.total_amount);
    const atCounter = Decimal.min(new Decimal(s.cash_received), total);
    const later = paidBySale[s.id] || new Decimal(0);
    const owed = Decimal.max(new Decimal(s.balance), 0);
    const remaining = s.status === 'void' ? new Decimal(0) : Decimal.max(owed.minus(later), 0);
    return {
      ...s,
      paid: atCounter.plus(later).toFixed(2),
      remaining: remaining.toFixed(2),
    };
  });

  return { sales: saleRows, payments, balance: await customerBalance(customerId) };
}
