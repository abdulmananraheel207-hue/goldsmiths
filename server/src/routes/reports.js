import { Router } from 'express';
import Decimal from 'decimal.js';
import { db } from '../db.js';
import { asyncH } from '../utils/errors.js';
import { parse } from '../utils/validate.js';
import { BALANCE_SQL } from '../services/ledger.js';
import { getCurrentRate } from '../services/rates.js';
import { applySaleFilters, saleFilterSchema, saleListColumns } from './sales.js';

const router = Router();
const dec = (v) => new Decimal(v ?? 0).toFixed(2);

router.get(
  '/sales',
  asyncH(async (req, res) => {
    const f = parse(saleFilterSchema, { pageSize: 10000, ...req.query });
    const q = db('sales as s')
      .join('customers as cu', 'cu.id', 's.customer_id')
      .select(...saleListColumns)
      .orderBy('s.id', 'desc')
      .limit(f.pageSize);
    applySaleFilters(q, f);
    const rows = await q;

    const active = rows.filter((r) => r.status === 'active');
    const sum = (k) => active.reduce((t, r) => t.plus(r[k]), new Decimal(0)).toFixed(2);
    res.json({
      data: rows,
      summary: {
        count: active.length,
        void_count: rows.length - active.length,
        subtotal: sum('subtotal'),
        discount: sum('discount'),
        tax_amount: sum('tax_amount'),
        total_amount: sum('total_amount'),
        cash_received: sum('cash_received'),
      },
    });
  }),
);

router.get(
  '/stock',
  asyncH(async (req, res) => {
    const items = await db('items as i')
      .join('categories as c', 'c.id', 'i.category_id')
      .whereNull('i.deleted_at')
      .select('i.id', 'i.name', 'i.tag', 'i.weight_grams', 'i.quantity', 'i.status', 'c.id as category_id', 'c.name as category_name', 'c.karat', 'c.price_per_gram')
      .orderBy('c.karat', 'desc')
      .orderBy('i.tag');
    const byCat = {};
    for (const i of items) {
      const k = i.category_id;
      byCat[k] ??= {
        category_id: k,
        category_name: i.category_name,
        karat: i.karat,
        item_count: 0,
        total_quantity: 0,
        total_weight: new Decimal(0),
        estimated_value: new Decimal(0),
      };
      const g = byCat[k];
      const w = new Decimal(i.weight_grams).times(i.quantity);
      g.item_count += 1;
      g.total_quantity += Number(i.quantity);
      g.total_weight = g.total_weight.plus(w);
      g.estimated_value = g.estimated_value.plus(w.times(i.price_per_gram));
    }
    const summary = Object.values(byCat).map((g) => ({
      ...g,
      total_weight: g.total_weight.toFixed(3),
      estimated_value: g.estimated_value.toFixed(2),
    }));
    res.json({
      data: items.map((i) => ({
        ...i,
        total_weight: new Decimal(i.weight_grams).times(i.quantity).toFixed(3),
        estimated_value: new Decimal(i.weight_grams).times(i.quantity).times(i.price_per_gram).toFixed(2),
      })),
      summary,
    });
  }),
);

router.get(
  '/balances',
  asyncH(async (req, res) => {
    const rows = await db('customers as c')
      .whereNull('c.deleted_at')
      .select('c.id', 'c.name', 'c.cnic', 'c.phone', 'c.opening_balance', db.raw(`${BALANCE_SQL} AS balance`))
      .having('balance', '<>', 0)
      .orderBy('balance', 'desc');
    const data = rows.map((r) => ({ ...r, balance: dec(r.balance) }));
    const owed = data.filter((r) => Number(r.balance) > 0);
    res.json({
      data,
      summary: {
        customers_owing: owed.length,
        total_outstanding: owed.reduce((t, r) => t.plus(r.balance), new Decimal(0)).toFixed(2),
      },
    });
  }),
);

router.get(
  '/dashboard',
  asyncH(async (req, res) => {
    const count = async (q) => Number((await q.count({ n: '*' }).first()).n);
    const [customers, sales, items, categories] = await Promise.all([
      count(db('customers').whereNull('deleted_at').where('is_walk_in', false)),
      count(db('sales').where('status', 'active')),
      count(db('items').whereNull('deleted_at')),
      count(db('categories')),
    ]);
    const today = await db('sales')
      .where('status', 'active')
      .whereRaw('sale_date = CURDATE()')
      .select(db.raw('COUNT(*) AS n'), db.raw('COALESCE(SUM(total_amount),0) AS amount'))
      .first();
    const month = await db('sales')
      .where('status', 'active')
      .whereRaw("sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')")
      .select(db.raw('COUNT(*) AS n'), db.raw('COALESCE(SUM(total_amount),0) AS amount'))
      .first();
    const outstanding = await db
      .from(db('customers as c').whereNull('c.deleted_at').select(db.raw(`${BALANCE_SQL} AS balance`)).as('b'))
      .where('b.balance', '>', 0)
      .select(db.raw('COALESCE(SUM(b.balance),0) AS total'), db.raw('COUNT(*) AS n'))
      .first();
    const recent = await db('sales as s')
      .join('customers as cu', 'cu.id', 's.customer_id')
      .select(...saleListColumns)
      .orderBy('s.id', 'desc')
      .limit(10);
    const lowStock = await db('items as i')
      .join('categories as c', 'c.id', 'i.category_id')
      .whereNull('i.deleted_at')
      .where('i.status', 'active')
      .where('i.quantity', '<=', 1)
      .select('i.id', 'i.name', 'i.tag', 'i.quantity', 'c.name as category_name')
      .orderBy('i.quantity')
      .orderBy('i.tag')
      .limit(10);
    const rate = await getCurrentRate();

    res.json({
      counts: { customers, sales, items, categories },
      today: { count: Number(today.n), amount: dec(today.amount) },
      month: { count: Number(month.n), amount: dec(month.amount) },
      outstanding: { total: dec(outstanding.total), customers: Number(outstanding.n) },
      recent_sales: recent,
      low_stock: lowStock,
      rate_set_today: Boolean(rate?.is_today),
    });
  }),
);

/** Sales chart. range: today (hourly), 7d (daily), month (daily, this month), 30d (daily). */
router.get(
  '/dashboard/chart',
  asyncH(async (req, res) => {
    const range = ['today', '7d', 'month', '30d'].includes(req.query.range) ? req.query.range : '30d';
    if (range === 'today') {
      const rows = await db('sales')
        .where('status', 'active')
        .whereRaw('sale_date = CURDATE()')
        .select(db.raw('HOUR(created_at) AS h'), db.raw('COUNT(*) AS n'), db.raw('SUM(total_amount) AS amount'))
        .groupByRaw('HOUR(created_at)');
      const map = Object.fromEntries(rows.map((r) => [Number(r.h), r]));
      const data = [];
      for (let h = 8; h <= 22; h++) {
        data.push({
          key: String(h),
          label: `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`,
          count: Number(map[h]?.n || 0),
          amount: dec(map[h]?.amount || 0),
        });
      }
      return res.json({ range, data });
    }
    const [[{ today }]] = await db.raw("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
    const end = new Date(`${today}T00:00:00Z`);
    let start;
    if (range === '7d') start = new Date(end.getTime() - 6 * 864e5);
    else if (range === 'month') start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    else start = new Date(end.getTime() - 29 * 864e5);
    const iso = (d) => d.toISOString().slice(0, 10);
    const rows = await db('sales')
      .where('status', 'active')
      .whereBetween('sale_date', [iso(start), today])
      .select('sale_date', db.raw('COUNT(*) AS n'), db.raw('SUM(total_amount) AS amount'))
      .groupBy('sale_date');
    const map = Object.fromEntries(rows.map((r) => [String(r.sale_date).slice(0, 10), r]));
    const data = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 864e5)) {
      const k = iso(d);
      data.push({ key: k, label: k, count: Number(map[k]?.n || 0), amount: dec(map[k]?.amount || 0) });
    }
    res.json({ range, data });
  }),
);

export default router;
