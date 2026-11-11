import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import Decimal from 'decimal.js';
import { asyncH, conflict, notFound } from '../utils/errors.js';
import { parse, decimalStr, idParam } from '../utils/validate.js';
import { applyDailyRate, setCategoryPrice, pricesForKarat } from '../services/rates.js';
import { factor8 } from '../services/goldRates.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get(
  '/',
  asyncH(async (req, res) => {
    const { status, search } = req.query;
    const q = db('categories as c')
      .select(
        'c.*',
        db.raw('(SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.deleted_at IS NULL) AS item_count'),
      )
      .orderBy('c.karat', 'desc')
      .orderBy('c.name');
    if (status === 'active' || status === 'inactive') q.where('c.status', status);
    if (search) q.where('c.name', 'like', `%${search}%`);
    const rows = await q;
    res.json({
      data: rows.map((r) => ({ ...r, is_manual_override: Boolean(r.is_manual_override), item_count: Number(r.item_count) })),
      total: rows.length,
    });
  }),
);

const dailySchema = z.object({
  price_24k_per_tola: decimalStr('24K price per tola', { allowZero: false, max: 1e10 }),
  keep_manual: z.boolean().optional().default(false),
});

router.post(
  '/apply-daily-rate',
  asyncH(async (req, res) => {
    const { price_24k_per_tola, keep_manual } = parse(dailySchema, req.body);
    const result = await applyDailyRate({ price24k: price_24k_per_tola, keepManual: keep_manual });
    res.json({
      message: keep_manual
        ? "Today's gold price is saved. Manually set karats were kept unchanged."
        : "Today's gold price is saved and all karats are updated.",
      ...result,
    });
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name, for example 19K').max(60),
  karat: z.coerce
    .number({ invalid_type_error: 'Karat must be a number' })
    .int('Karat must be a whole number')
    .min(1, 'Karat must be between 1 and 24')
    .max(24, 'Karat must be between 1 and 24'),
  status: z.enum(['active', 'inactive']).default('active'),
});

router.post(
  '/',
  asyncH(async (req, res) => {
    const data = parse(createSchema, req.body);
    const exists = await db('categories').where({ name: data.name }).first();
    if (exists) throw conflict('A category with this name already exists.', { name: 'This name is already used' });
    const id = await db.transaction(async (trx) => {
      const prices = await pricesForKarat(trx, data.karat);
      const [newId] = await trx('categories').insert({ ...data, factor: factor8(data.karat), ...prices });
      await audit(trx, 'create', 'category', newId, { ...data, ...prices });
      return newId;
    });
    res.status(201).json({ message: 'Category added.', category: await db('categories').where({ id }).first() });
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name').max(60).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  price_per_tola: decimalStr('Price per tola', { allowZero: false, max: 1e10 }).optional(),
});

router.put(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const data = parse(updateSchema, req.body);
    await db.transaction(async (trx) => {
      const cat = await trx('categories').where({ id }).forUpdate().first();
      if (!cat) throw notFound('Category not found.');
      const update = {};
      if (data.name && data.name !== cat.name) {
        const dup = await trx('categories').where({ name: data.name }).whereNot({ id }).first();
        if (dup) throw conflict('A category with this name already exists.', { name: 'This name is already used' });
        update.name = data.name;
      }
      if (data.status) update.status = data.status;
      if (data.price_per_tola !== undefined && !new Decimal(data.price_per_tola).eq(cat.price_per_tola)) {
        Object.assign(update, await setCategoryPrice(trx, cat, data.price_per_tola));
      }
      if (!Object.keys(update).length) return;
      await trx('categories').where({ id }).update(update);
      await audit(trx, update.price_per_tola ? 'price_override' : 'update', 'category', id, {
        before: { name: cat.name, status: cat.status, price_per_tola: cat.price_per_tola },
        after: update,
      });
    });
    res.json({ message: 'Category updated.', category: await db('categories').where({ id }).first() });
  }),
);

router.delete(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const cat = await db('categories').where({ id }).first();
    if (!cat) throw notFound('Category not found.');
    const items = await db('items').where({ category_id: id }).count({ n: '*' }).first();
    if (Number(items.n) > 0) {
      throw conflict(
        `This category has ${items.n} item(s) and cannot be deleted. You can mark it inactive instead.`,
        { canDeactivate: true },
      );
    }
    await db.transaction(async (trx) => {
      await trx('categories').where({ id }).delete();
      await audit(trx, 'delete', 'category', id, { name: cat.name, karat: cat.karat });
    });
    res.json({ message: 'Category deleted.' });
  }),
);

export default router;
