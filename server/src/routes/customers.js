import { Router } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '../db.js';
import { asyncH, badRequest, conflict, notFound } from '../utils/errors.js';
import {
  parse,
  paginationSchema,
  idParam,
  optionalText,
  decimalStr,
  formatCnic,
  formatPkMobile,
} from '../utils/validate.js';
import { BALANCE_SQL, customerLedger, customerBalance } from '../services/ledger.js';
import { audit } from '../services/audit.js';

const router = Router();

const baseQuery = () =>
  db('customers as c')
    .whereNull('c.deleted_at')
    .select('c.*', db.raw(`${BALANCE_SQL} AS balance`));

const view = (c) => ({ ...c, is_walk_in: Boolean(c.is_walk_in), balance: new Decimal(c.balance ?? 0).toFixed(2) });

router.get(
  '/',
  asyncH(async (req, res) => {
    const { page, pageSize, search } = parse(paginationSchema, req.query);
    const status = req.query.status;
    const filter = (q) => {
      q.whereNull('c.deleted_at');
      if (status === 'active' || status === 'inactive') q.where('c.status', status);
      if (search) {
        const digits = search.replace(/\D/g, '');
        q.where((w) => {
          w.where('c.name', 'like', `%${search}%`)
            .orWhere('c.email', 'like', `%${search}%`)
            .orWhere('c.address', 'like', `%${search}%`);
          if (/^\d+$/.test(search.trim())) w.orWhere('c.id', Number(search.trim()));
          if (digits.length >= 3) {
            w.orWhereRaw("REPLACE(c.cnic, '-', '') LIKE ?", [`%${digits}%`]).orWhereRaw(
              "REPLACE(c.phone, '-', '') LIKE ?",
              [`%${digits}%`],
            );
          }
        });
      }
    };
    const totalQ = db('customers as c').count({ n: '*' });
    filter(totalQ);
    const [{ n }] = await totalQ;
    const q = baseQuery()
      .orderBy('c.is_walk_in', 'desc')
      .orderBy('c.id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    filter(q);
    res.json({ data: (await q).map(view), total: Number(n), page, pageSize });
  }),
);

/** Lightweight list for dropdowns (Add Sale customer picker). */
router.get(
  '/options',
  asyncH(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const q = db('customers as c')
      .whereNull('c.deleted_at')
      .where('c.status', 'active')
      .select('c.id', 'c.name', 'c.cnic', 'c.phone', 'c.is_walk_in')
      .orderBy('c.is_walk_in', 'desc')
      .orderBy('c.name')
      .limit(30);
    if (search) {
      const digits = search.replace(/\D/g, '');
      q.where((w) => {
        w.where('c.name', 'like', `%${search}%`);
        if (digits.length >= 3) {
          w.orWhereRaw("REPLACE(c.cnic, '-', '') LIKE ?", [`%${digits}%`]).orWhereRaw(
            "REPLACE(c.phone, '-', '') LIKE ?",
            [`%${digits}%`],
          );
        }
      });
    }
    const rows = await q;
    res.json({ data: rows.map((r) => ({ ...r, is_walk_in: Boolean(r.is_walk_in) })) });
  }),
);

const customerSchema = z.object({
  name: z.string({ required_error: 'Please enter the customer name' }).trim().min(2, 'Please enter the customer name').max(150),
  cnic: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z
      .string()
      .nullable()
      .refine((v) => v === null || formatCnic(v), 'CNIC must have 13 digits, for example 35202-1234567-1')
      .transform((v) => (v === null ? null : formatCnic(v))),
  ),
  phone: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z
      .string()
      .nullable()
      .refine((v) => v === null || formatPkMobile(v), 'Mobile number must look like 0300-1234567')
      .transform((v) => (v === null ? null : formatPkMobile(v))),
  ),
  email: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().email('Please enter a valid email address, for example name@example.com').nullable(),
  ),
  address: optionalText(255),
  opening_balance: z.preprocess((v) => (v === '' || v == null ? '0' : v), decimalStr('Opening balance', { min: -1e10 })),
  status: z.enum(['active', 'inactive']).default('active'),
});

async function checkCnicUnique(cnic, exceptId) {
  if (!cnic) return;
  const q = db('customers').where({ cnic });
  if (exceptId) q.whereNot({ id: exceptId });
  const dup = await q.first();
  if (dup) {
    throw conflict(
      dup.deleted_at
        ? 'This CNIC belonged to a customer who was deleted. Please contact support to restore them.'
        : `This CNIC is already registered to ${dup.name}.`,
      { cnic: 'This CNIC is already registered' },
    );
  }
}

router.post(
  '/',
  asyncH(async (req, res) => {
    const data = parse(customerSchema, req.body);
    await checkCnicUnique(data.cnic);
    const id = await db.transaction(async (trx) => {
      const [newId] = await trx('customers').insert(data);
      await audit(trx, 'create', 'customer', newId, data);
      return newId;
    });
    const customer = await baseQuery().where('c.id', id).first();
    res.status(201).json({ message: 'Customer added.', customer: view(customer) });
  }),
);

async function loadCustomer(id) {
  const c = await baseQuery().where('c.id', id).first();
  if (!c) throw notFound('Customer not found. They may have been deleted.');
  return view(c);
}

router.get(
  '/:id',
  asyncH(async (req, res) => {
    res.json({ customer: await loadCustomer(parse(idParam, req.params.id)) });
  }),
);

router.put(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const before = await loadCustomer(id);
    const data = parse(customerSchema, req.body);
    if (before.is_walk_in) {
      data.status = 'active';
      data.opening_balance = '0';
    }
    await checkCnicUnique(data.cnic, id);
    await db.transaction(async (trx) => {
      await trx('customers').where({ id }).update(data);
      await audit(trx, 'update', 'customer', id, { before, after: data });
    });
    res.json({ message: 'Customer details saved.', customer: await loadCustomer(id) });
  }),
);

router.delete(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const c = await loadCustomer(id);
    if (c.is_walk_in) throw badRequest('The Walk-in Customer is built in and cannot be deleted.');
    if (new Decimal(c.balance).gt(0)) {
      throw conflict(`This customer still owes Rs ${c.balance}. Please settle the balance before deleting.`);
    }
    const [{ n: sales }] = await db('sales').where({ customer_id: id }).count({ n: '*' });
    const [{ n: payments }] = await db('customer_payments').where({ customer_id: id }).count({ n: '*' });
    const soft = Number(sales) + Number(payments) > 0;
    await db.transaction(async (trx) => {
      if (soft) await trx('customers').where({ id }).update({ deleted_at: trx.fn.now(), status: 'inactive' });
      else await trx('customers').where({ id }).delete();
      await audit(trx, 'delete', 'customer', id, { name: c.name, cnic: c.cnic, soft });
    });
    res.json({ message: 'Customer deleted.' });
  }),
);

router.get(
  '/:id/ledger',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const customer = await loadCustomer(id);
    res.json({ customer, ...(await customerLedger(id)) });
  }),
);

router.get(
  '/:id/payments',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    await loadCustomer(id);
    const data = await db('customer_payments as p')
      .leftJoin('sales as s', 's.id', 'p.sale_id')
      .where('p.customer_id', id)
      .select('p.*', 's.invoice_number')
      .orderBy('p.paid_at', 'desc');
    res.json({ data });
  }),
);

const paymentSchema = z.object({
  amount: decimalStr('Amount', { allowZero: false, max: 1e10 }),
  method: z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
  note: optionalText(255),
  sale_id: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().nullable()),
});

router.post(
  '/:id/payments',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const data = parse(paymentSchema, req.body);
    const paymentId = await db.transaction(async (trx) => {
      const c = await trx('customers').where({ id }).whereNull('deleted_at').forUpdate().first();
      if (!c) throw notFound('Customer not found.');
      const balance = new Decimal(await customerBalance(id, trx));
      if (balance.lte(0)) throw badRequest('This customer does not owe anything right now.');
      if (new Decimal(data.amount).gt(balance)) {
        throw badRequest(`This is more than the customer owes (Rs ${balance.toFixed(2)}).`, {
          amount: `Cannot be more than Rs ${balance.toFixed(2)}`,
        });
      }
      if (data.sale_id) {
        const sale = await trx('sales').where({ id: data.sale_id, customer_id: id, status: 'active' }).first();
        if (!sale) throw badRequest('That invoice does not belong to this customer.', { sale_id: 'Invalid invoice' });
      }
      const [pid] = await trx('customer_payments').insert({ ...data, customer_id: id });
      await audit(trx, 'payment', 'customer', id, { payment_id: pid, ...data, balance_before: balance.toFixed(2) });
      return pid;
    });
    res.status(201).json({
      message: 'Payment received and recorded.',
      payment: await db('customer_payments').where({ id: paymentId }).first(),
      balance: await customerBalance(id),
    });
  }),
);

export default router;
