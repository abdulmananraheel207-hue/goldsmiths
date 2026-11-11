import { db } from '../db.js';

/**
 * Write an audit log row. Pass the transaction when inside one so the log
 * is committed (or rolled back) together with the change.
 */
export async function audit(trx, action, entity, entityId, details = null) {
  await (trx || db)('audit_log').insert({
    action,
    entity,
    entity_id: entityId ?? null,
    details: details ? JSON.stringify(details) : null,
  });
}
