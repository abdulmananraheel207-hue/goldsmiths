import { db } from '../db.js';
import { DEFAULT_GRAMS_PER_TOLA } from './goldRates.js';
import { encrypt, decrypt } from './crypto.js';
import { isConfigured, missingSettings, endpointFor } from './taxUploader.js';

export const DEFAULT_TAX_INTEGRATION = {
  authority: 'FBR', // FBR (goods: jewellery) or PRA (Punjab services)
  authority_label: 'FBR',
  pos_id: '',
  pntn: '', // PRA only
  default_pct_code: '',
  endpoint_url: '', // empty = built-in address for the authority + environment
  token_encrypted: null,
  environment: 'sandbox',
  auto_upload: true,
};

export const SETTING_DEFAULTS = {
  shop_name: 'My Jewellers',
  shop_address: '',
  shop_phone: '',
  shop_email: '',
  ntn: '',
  stn: '',
  logo_path: '',
  grams_per_tola: DEFAULT_GRAMS_PER_TOLA,
  tax_percent: '3',
  pos_service_fee: '1',
  card_fee_percent: '0',
  invoice_prefix: 'INV-',
  invoice_footer_note: 'Verify this invoice through the tax authority app or SMS.',
  idle_timeout_hours: '8',
  currency: 'PKR',
  tax_integration: DEFAULT_TAX_INTEGRATION,
};

function decode(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

let cache = null;
let cacheAt = 0;

/** All settings merged over defaults. Cached for a few seconds. */
export async function getSettings(trx) {
  if (!trx && cache && Date.now() - cacheAt < 5000) return cache;
  const rows = await (trx || db)('settings').select('key', 'value');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = decode(r.value);
  out.tax_integration = { ...DEFAULT_TAX_INTEGRATION, ...(out.tax_integration || {}) };
  if (!trx) {
    cache = out;
    cacheAt = Date.now();
  }
  return out;
}

export function clearSettingsCache() {
  cache = null;
}

export async function saveSettings(values, trx) {
  const conn = trx || db;
  for (const [key, value] of Object.entries(values)) {
    await conn('settings')
      .insert({ key, value: JSON.stringify(value) })
      .onConflict('key')
      .merge(['value']);
  }
  clearSettingsCache();
}

/** Settings safe to send to the browser (tax credential masked, never decrypted). */
export function publicSettings(s) {
  const { token_encrypted, ...tax } = s.tax_integration;
  const token = decrypt(token_encrypted);
  const full = { ...tax, token };
  return {
    ...s,
    tax_integration: {
      ...tax,
      has_token: Boolean(token),
      token_masked: token ? `•••••••• ${token.slice(-4)}` : '',
      is_configured: isConfigured(full),
      missing: missingSettings(full),
      effective_endpoint: endpointFor(full),
    },
  };
}

export function encryptToken(plain) {
  return encrypt(plain);
}

export function decryptToken(enc) {
  return decrypt(enc);
}
