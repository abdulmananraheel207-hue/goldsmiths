import { db } from '../db.js';
import { getSettings, decryptToken } from './settings.js';
import * as uploader from './taxUploader.js';
import { getSaleFull } from './sales.js';

const MAX_ATTEMPTS = 10;

function integrationConfig(settings) {
  const { token_encrypted, ...rest } = settings.tax_integration;
  return { ...rest, token: decryptToken(token_encrypted) };
}

/** Try to upload one queued sale. Never throws. */
export async function processQueueEntry(entry) {
  try {
    const settings = await getSettings();
    const sale = await getSaleFull(entry.sale_id);
    if (!sale || sale.status === 'void') {
      await db('tax_upload_queue').where({ id: entry.id }).update({ status: 'cancelled' });
      return { status: 'cancelled' };
    }
    await db('tax_upload_queue')
      .where({ id: entry.id })
      .update({ status: 'processing', attempts: entry.attempts + 1 });

    const result = await uploader.uploadInvoice(sale, integrationConfig(settings));
    const now = db.fn.now();

    if (result.status === 'uploaded') {
      await db.transaction(async (trx) => {
        await trx('sales').where({ id: sale.id }).update({
          tax_status: 'uploaded',
          tax_invoice_number: result.taxInvoiceNumber || null,
          tax_response: result.response ? JSON.stringify(result.response) : null,
          tax_uploaded_at: now,
        });
        await trx('tax_upload_queue').where({ id: entry.id }).update({ status: 'uploaded', last_error: null });
      });
    } else if (result.status === 'failed') {
      const attempts = entry.attempts + 1;
      const retry = result.retryable !== false && attempts < MAX_ATTEMPTS;
      const delayMin = Math.min(60, 2 ** attempts);
      await db('sales')
        .where({ id: sale.id })
        .update({
          tax_status: 'failed',
          tax_response: result.response ? JSON.stringify(result.response) : null,
        });
      await db('tax_upload_queue')
        .where({ id: entry.id })
        .update({
          status: retry ? 'pending' : 'failed',
          last_error: result.error || 'Upload failed',
          next_attempt_at: retry ? db.raw('DATE_ADD(NOW(), INTERVAL ? MINUTE)', [delayMin]) : null,
        });
    } else {
      await db('sales').where({ id: sale.id }).update({ tax_status: 'not_configured' });
      await db('tax_upload_queue')
        .where({ id: entry.id })
        .update({ status: 'not_configured', last_error: uploader.NOT_CONFIGURED_MESSAGE });
    }
    return result;
  } catch (err) {
    console.error('Tax queue error:', err.message);
    await db('tax_upload_queue')
      .where({ id: entry.id })
      .update({
        status: 'pending',
        last_error: err.message,
        next_attempt_at: db.raw('DATE_ADD(NOW(), INTERVAL 5 MINUTE)'),
      })
      .catch(() => {});
    return { status: 'failed', error: err.message };
  }
}

/** Process the latest queue entry for a sale (used right after saving, and by "Resend"). */
export async function processSale(saleId, { resend = false } = {}) {
  let entry = await db('tax_upload_queue').where({ sale_id: saleId }).orderBy('id', 'desc').first();
  if (!entry || resend) {
    const [id] = await db('tax_upload_queue').insert({ sale_id: saleId, status: 'pending' });
    await db('sales').where({ id: saleId }).update({ tax_status: 'pending' });
    entry = await db('tax_upload_queue').where({ id }).first();
  }
  return processQueueEntry(entry);
}

/**
 * Should a newly saved sale be processed straight away?
 * Not set up yet → yes (it is just marked "Not configured"). Set up → only if "Upload automatically" is on;
 * otherwise it waits as "Waiting to send" until "Resend to Tax" is pressed.
 */
export async function shouldUploadNow() {
  const s = await getSettings();
  return !uploader.isConfigured(integrationConfig(s)) || Boolean(s.tax_integration.auto_upload);
}

/** Background worker: retries pending entries whose time has come. */
export async function processDueEntries(limit = 20) {
  const s = await getSettings();
  // Not set up yet: process so sales are marked "Not configured". Set up but auto-upload off: wait for "Resend".
  if (uploader.isConfigured(integrationConfig(s)) && !s.tax_integration.auto_upload) return 0;
  const due = await db('tax_upload_queue')
    .where('status', 'pending')
    .andWhere((q) => q.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', db.fn.now()))
    .orderBy('id')
    .limit(limit);
  for (const entry of due) await processQueueEntry(entry);
  return due.length;
}

export async function testConnection() {
  const settings = await getSettings();
  return uploader.testConnection(integrationConfig(settings));
}
