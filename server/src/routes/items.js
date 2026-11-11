import { Router } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '../db.js';
import { asyncH, conflict, notFound } from '../utils/errors.js';
import { parse, paginationSchema, idParam, decimalStr } from '../utils/validate.js';
import { audit } from '../services/audit.js';

const router = Router();

const baseQuery = () =>
  db('items as i')
    .join('categories as c', 'c.id', 'i.category_id')
    .whereNull('i.deleted_at')
    .select(
      'i.*',
      'c.name as category_name',
      'c.karat',
      'c.price_per_gram as category_price_per_gram',
      'c.status as category_status',
    );

/** Estimated value is ALWAYS computed live from the category's current gram rate. */
const view = (i) => ({
  ...i,
  estimated_value: new Decimal(i.weight_grams).times(i.category_price_per_gram || 0).times(i.quantity).toFixed(2),
  estimated_value_each: new Decimal(i.weight_grams).times(i.category_price_per_gram || 0).toFixed(2),
  in_stock: Number(i.quantity) > 0,
});

router.get(
  '/',
  asyncH(async (req, res) => {
    const { page, pageSize, search } = parse(paginationSchema, req.query);
    const categoryId = Number(req.query.category_id) || null;
    const stock = req.query.stock;
    const filter = (q) => {
      q.whereNull('i.deleted_at');
      if (categoryId) q.where('i.category_id', categoryId);
      if (req.query.status === 'active' || req.query.status === 'inactive') q.where('i.status', req.query.status);
      if (stock === 'in') q.where('i.quantity', '>', 0);
      if (stock === 'out') q.where('i.quantity', 0);
      if (stock === 'low') q.where('i.quantity', '<=', 1);
      if (search) {
        q.where((w) => {
          w.where('i.name', 'like', `%${search}%`).orWhere('i.tag', 'like', `%${search}%`);
          if (/^\d+$/.test(search)) w.orWhere('i.id', Number(search));
        });
      }
    };
    const totalQ = db('items as i').count({ n: '*' });
    filter(totalQ);
    const [{ n }] = await totalQ;
    const q = baseQuery()
      .orderBy('i.id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    filter(q);
    res.json({ data: (await q).map(view), total: Number(n), page, pageSize });
  }),
);

/** Type-ahead for Add Sale: matches tag or name. */
router.get(
  '/lookup',
  asyncH(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const query = baseQuery()
      .where('i.status', 'active')
      .orderByRaw('i.tag = ? DESC', [q])
      .orderBy('i.quantity', 'desc')
      .orderBy('i.tag')
      .limit(15);
    if (q) query.where((w) => w.where('i.tag', 'like', `%${q}%`).orWhere('i.name', 'like', `%${q}%`));
    res.json({ data: (await query).map(view) });
  }),
);

/** Next tag for a prefix, e.g. CH → CH0004. */
router.get(
  '/tags/next',
  asyncH(async (req, res) => {
    const prefix =
      String(req.query.prefix || '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 4) || 'IT';
    const rows = await db('items').where('tag', 'like', `${prefix}%`).select('tag');
    let max = 0;
    for (const { tag } of rows) {
      const m = tag.toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]));
    }
    res.json({ tag: `${prefix}${String(max + 1).padStart(4, '0')}` });
  }),
);

/** Similar existing tags + whether this exact tag is taken. */
router.get(
  '/tags/check',
  asyncH(async (req, res) => {
    const tag = String(req.query.tag || '').trim();
    const excludeId = Number(req.query.exclude_id) || 0;
    if (!tag) return res.json({ exists: false, similar: [] });
    const exact = await db('items').where({ tag }).whereNot({ id: excludeId }).first();
    const similar = await db('items')
      .where('tag', 'like', `${tag.slice(0, 2)}%`)
      .whereNot({ id: excludeId })
      .whereNull('deleted_at')
      .select('id', 'tag', 'name')
      .orderBy('tag')
      .limit(8);
    res.json({
      exists: Boolean(exact),
      existing: exact ? { id: exact.id, name: exact.name, deleted: Boolean(exact.deleted_at) } : null,
      similar,
    });
  }),
);

const itemSchema = z.object({
  name: z.string({ required_error: 'Please enter the item name' }).trim().min(2, 'Please enter the item name').max(150),
  tag: z
    .string({ required_error: 'Please enter a tag or click Auto-generate' })
    .trim()
    .min(1, 'Please enter a tag or click Auto-generate')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use only letters, numbers and dashes in the tag')
    .transform((v) => v.toUpperCase()),
  category_id: z.coerce.number({ invalid_type_error: 'Please choose a category' }).int().positive('Please choose a category'),
  weight_grams: decimalStr('Weight', { allowZero: false, max: 100000 }).refine(
    (v) => !v.includes('.') || v.split('.')[1].length <= 3,
    'Weight can have at most 3 decimal places',
  ),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a whole number' })
    .int('Quantity must be a whole number')
    .min(0, 'Quantity cannot be negative')
    .max(100000),
  status: z.enum(['active', 'inactive']).default('active'),
});

async function checkTag(tag, exceptId) {
  const q = db('items').where({ tag });
  if (exceptId) q.whereNot({ id: exceptId });
  const dup = await q.first();
  if (dup) {
    throw conflict(
      dup.deleted_at
        ? 'This tag was used by an item that has been deleted. Please choose another tag.'
        : `This tag is already used by "${dup.name}". Please choose another tag.`,
      { tag: 'This tag is already used' },
    );
  }
}

async function checkCategory(id) {
  const c = await db('categories').where({ id }).first();
  if (!c) throw conflict('Please choose a valid category.', { category_id: 'Please choose a category' });
}

async function loadItem(id) {
  const i = await baseQuery().where('i.id', id).first();
  if (!i) throw notFound('Item not found. It may have been deleted.');
  return view(i);
}

router.get(
  '/:id',
  asyncH(async (req, res) => {
    res.json({ item: await loadItem(parse(idParam, req.params.id)) });
  }),
);

router.post(
  '/',
  asyncH(async (req, res) => {
    const data = parse(itemSchema, req.body);
    await checkTag(data.tag);
    await checkCategory(data.category_id);
    const id = await db.transaction(async (trx) => {
      const [newId] = await trx('items').insert(data);
      await audit(trx, 'create', 'item', newId, data);
      return newId;
    });
    res.status(201).json({ message: 'Item added.', item: await loadItem(id) });
  }),
);

router.put(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const before = await loadItem(id);
    const data = parse(itemSchema, req.body);
    await checkTag(data.tag, id);
    await checkCategory(data.category_id);
    await db.transaction(async (trx) => {
      await trx('items').where({ id }).update(data);
      await audit(trx, 'update', 'item', id, {
        before: {
          name: before.name,
          tag: before.tag,
          category_id: before.category_id,
          weight_grams: before.weight_grams,
          quantity: before.quantity,
          status: before.status,
        },
        after: data,
      });
    });
    res.json({ message: 'Item saved.', item: await loadItem(id) });
  }),
);

router.delete(
  '/:id',
  asyncH(async (req, res) => {
    const id = parse(idParam, req.params.id);
    const item = await loadItem(id);
    const [{ n }] = await db('sale_items').where({ item_id: id }).count({ n: '*' });
    const soft = Number(n) > 0;
    await db.transaction(async (trx) => {
      if (soft) await trx('items').where({ id }).update({ deleted_at: trx.fn.now(), status: 'inactive' });
      else await trx('items').where({ id }).delete();
      await audit(trx, 'delete', 'item', id, { tag: item.tag, name: item.name, soft });
    });
    res.json({ message: 'Item deleted.' });
  }),
);

export default router;
