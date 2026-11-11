import { Router } from 'express';
import { db } from '../db.js';
import { asyncH } from '../utils/errors.js';
import { parse, paginationSchema } from '../utils/validate.js';
import { getCurrentRate } from '../services/rates.js';
import { getSettings } from '../services/settings.js';

const router = Router();

router.get(
  '/current',
  asyncH(async (req, res) => {
    const [current, settings] = await Promise.all([getCurrentRate(), getSettings()]);
    res.json({
      current,
      is_set_today: Boolean(current?.is_today),
      grams_per_tola: settings.grams_per_tola,
    });
  }),
);

router.get(
  '/history',
  asyncH(async (req, res) => {
    const { page, pageSize } = parse(paginationSchema, req.query);
    const [{ n }] = await db('gold_rate_history').count({ n: '*' });
    const data = await db('gold_rate_history')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    res.json({
      data: data.map((r) => ({ ...r, applied_to_all: Boolean(r.applied_to_all) })),
      total: Number(n),
      page,
      pageSize,
    });
  }),
);

export default router;
