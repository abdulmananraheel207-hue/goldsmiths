/**
 * Database side of gold rates. All maths comes from goldRates.js.
 */
import { db } from '../db.js';
import { getSettings } from './settings.js';
import { ratePerTola, gramPriceFromTola, round4, factor8 } from './goldRates.js';
import { audit } from './audit.js';
import { badRequest } from '../utils/errors.js';

/** The current rate = most recent gold_rate_history entry. */
export async function getCurrentRate(trx) {
  const conn = trx || db;
  const row = await conn('gold_rate_history')
    .select('*', conn.raw('DATE(created_at) = CURDATE() AS is_today'))
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .first();
  if (!row) return null;
  return { ...row, is_today: Boolean(Number(row.is_today)), applied_to_all: Boolean(row.applied_to_all) };
}

/**
 * Set today's 24K price per tola and recalculate every karat in ONE transaction.
 * keepManual = true leaves manually-set karats unchanged.
 */
export async function applyDailyRate({ price24k, keepManual = false, note = null }, existingTrx) {
  const run = async (trx) => {
    const settings = await getSettings(trx);
    const gpt = settings.grams_per_tola;
    const categories = await trx('categories').select('*').forUpdate();
    const changes = [];

    for (const c of categories) {
      if (keepManual && c.is_manual_override) continue;
      const perTola = ratePerTola(c.karat, price24k);
      const perGram = gramPriceFromTola(perTola, gpt);
      await trx('categories')
        .where({ id: c.id })
        .update({
          price_per_tola: round4(perTola),
          price_per_gram: round4(perGram),
          factor: factor8(c.karat),
          is_manual_override: false,
        });
      changes.push({ id: c.id, name: c.name, old_tola: c.price_per_tola, new_tola: round4(perTola) });
    }

    const appliedToAll = !(keepManual && categories.some((c) => c.is_manual_override));
    const [id] = await trx('gold_rate_history').insert({
      price_24k_per_tola: round4(price24k),
      applied_to_all: appliedToAll,
      note,
    });
    await audit(trx, 'rate_change', 'gold_rate_history', id, {
      price_24k_per_tola: round4(price24k),
      applied_to_all: appliedToAll,
      categories_updated: changes.length,
    });
    return { id, applied_to_all: appliedToAll, categories_updated: changes.length };
  };
  return existingTrx ? run(existingTrx) : db.transaction(run);
}

/** Manually set one karat's tola price (gram price recomputed). */
export async function setCategoryPrice(trx, category, pricePerTola) {
  const settings = await getSettings(trx);
  const perGram = gramPriceFromTola(pricePerTola, settings.grams_per_tola);
  if (perGram.lte(0)) throw badRequest('Price per tola must be more than zero.');
  return {
    price_per_tola: round4(pricePerTola),
    price_per_gram: round4(perGram),
    is_manual_override: true,
  };
}

/** Prices for a new category, derived from the current 24K rate (0 if none set yet). */
export async function pricesForKarat(trx, karat) {
  const current = await getCurrentRate(trx);
  if (!current) return { price_per_tola: '0.0000', price_per_gram: '0.0000' };
  const settings = await getSettings(trx);
  const perTola = ratePerTola(karat, current.price_24k_per_tola);
  return {
    price_per_tola: round4(perTola),
    price_per_gram: round4(gramPriceFromTola(perTola, settings.grams_per_tola)),
  };
}
