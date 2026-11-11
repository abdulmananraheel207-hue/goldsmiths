import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { asyncH, notFound, badRequest } from '../utils/errors.js';
import { parse, paginationSchema, idParam, decimalStr, optionalDecimal, optionalText, dateStr } from '../utils/validate.js';
import { createSale, voidSale, getSaleFull } from '../services/sales.js';
import { processSale, shouldUploadNow } from '../services/taxQueue.js';
import { audit } from '../services/audit.js';

const router = Router();

/** Shared filter for sales lists and the sales report. */
export function applySaleFilters(q, { from, to, customer_id, status, search }) {
  if (from) q.where('s.sale_date', '>=', from);
  if (to) q.where('s.sale_date', '<=', to);
  if (customer_id) q.where('s.customer_id', customer_id);
  if (status === 'active' || status === 'void') q.where('s.status', status);
  if (search) {
    q.where((w) =>
      w
        .where('s.invoice_number', 'like', `%${search}%`)
        .orWhere('cu.name', 'like', `%${search}%`)
        .orWhere('s.bill_no', 'like', `%${search}%`)
        .orWhere('cu.cnic', 'like', `%${search}%`)
        .orWhere('cu.phone', 'like', `%${search}%`),
    );
  }
  return q;
}

export const saleFilterSchema = paginationSchema.extend({
  from: dateStr.optional().or(z.literal('').transform(() => undefined)),
  to: dateStr.optional().or(z.literal('').transform(() => undefined)),
  customer_id: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().optional()),
  status: z.string().optional(),
});

export const saleListColumns = [
  's.id',
  's.invoice_number',
  's.sale_date',
  's.created_at',
  's.customer_id',
  's.payment_method',
  's.subtotal',
  's.discount',
  's.tax_amount',
  's.total_amount',
  's.cash_received',
  's.balance',
  's.status',
  's.tax_status',
  's.tax_invoice_number',
  'cu.name as customer_name',
  'cu.cnic as customer_cnic',
  'cu.phone as customer_phone',
];

router.get(
  '/',
  asyncH(async (req, res) => {
    const f = parse(saleFilterSchema, req.query);
    const totalQ = db('sales as s').join('customers as cu', 'cu.id', 's.customer_id').count({ n: '*' });
    applySaleFilters(totalQ, f);
    const [{ n }] = await totalQ;
    const q = db('sales as s')
      .join('customers as cu', 'cu.id', 's.customer_id')
      .select(
        ...saleListColumns,
        db.raw('(SELECT COALESCE(SUM(p.amount),0) FROM customer_payments p WHERE p.sale_id = s.id) AS paid_later'),
      )
      .orderBy('s.id', 'desc')
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);
    applySaleFilters(q, f);
    res.json({ data: await q, total: Number(n), page: f.page, pageSize: f.pageSize });
  }),
);

router.get(
  '/:id',
  asyncH(async (req, res) => {
    const sale = await getSaleFull(parse(idParam, req.params.id));
    if (!sale) throw notFound('Sale not found.');
    res.json({ sale });
  }),
);

const lineSchema = z.object({
  item_id: z.coerce.number({ invalid_type_error: 'Please choose an item' }).int().positive('Please choose an item'),
  weight_grams: decimalStr('Weight', { allowZero: false, max: 100000 }).optional(),
  // Wastage is always in grams (any wastage_type sent is ignored).
  wastage_value: optionalDecimal('Wastage (grams)', { max: 100000 }).refine(
    (v) => !v.includes('.') || v.split('.')[1].length <= 3,
    'Wastage can have at most 3 decimal places',
  ),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a whole number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(10000),
  rate_per_gram: decimalStr('Rate per gram', { allowZero: false, max: 1e9 }),
  making_charges: optionalDecimal('Making charges', { max: 1e10 }),
  other_stone_charges: optionalDecimal('Other / stone charges', { max: 1e10 }),
  gold_received_value: optionalDecimal('Gold received', { max: 1e10 }),
});

const saleSchema = z.object({
  customer_id: z.coerce.number({ invalid_type_error: 'Please choose a customer' }).int().positive('Please choose a customer'),
  payment_method: z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
  bill_no: optionalText(60),
  remarks: optionalText(500),
  discount: optionalDecimal('Discount', { max: 1e10 }),
  cash_received: optionalDecimal('Cash received', { max: 1e11 }),
  lines: z.array(lineSchema).min(1, 'Please add at least one item to the sale').max(100),
});

router.post(
  '/',
  asyncH(async (req, res) => {
    const input = parse(saleSchema, req.body);
    const { id, invoice_number } = await createSale(input);
    // Tax upload runs after the sale is safely saved; failures never affect the sale.
    // If integration is set up but "Upload automatically" is off, the sale waits for "Resend to Tax".
    if (await shouldUploadNow().catch(() => true)) await processSale(id).catch(() => {});
    res.status(201).json({ message: `Sale saved. Invoice ${invoice_number}.`, sale: await getSaleFull(id) });
  }),
);

const voidSchema = z.object({
  reason: z
    .string({ required_error: 'Please write why this sale is being cancelled' })
    .trim()
    .min(3, 'Please write why this sale is being cancelled')
    .max(500),
});

router.post(
  '/:id/void',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const { reason } = parse(voidSchema, req.body);
    await voidSale(id, reason);
    res.json({ message: 'Sale cancelled. Stock has been restored.', sale: await getSaleFull(id) });
  }),
);

router.post(
  '/:id/resend-tax',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const sale = await db('sales').where({ id }).first();
    if (!sale) throw notFound('Sale not found.');
    if (sale.status === 'void') throw badRequest('This sale has been cancelled and cannot be sent.');
    if (sale.tax_status === 'uploaded') throw badRequest('This invoice has already been uploaded.');
    const result = await processSale(id, { resend: true });
    await audit(null, 'resend_tax', 'sale', id, { result: result.status });
    const fresh = await db('sales').where({ id }).first();
    const messages = {
      uploaded: 'Invoice uploaded to the tax authority.',
      not_configured: 'Tax integration is not configured yet. It will be set up later.',
      failed: `Upload failed: ${result.error || 'unknown error'}. It will be retried automatically.`,
    };
    res.json({ message: messages[result.status] || 'Done.', tax_status: fresh.tax_status });
  }),
);

export default router;
