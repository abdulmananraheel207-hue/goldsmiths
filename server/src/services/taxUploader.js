/**
 * Tax authority invoice upload (FBR POS / PRA IMS), "PostData" API.
 *
 * Both FBR (federal sales tax on goods; the one that applies to a jewellery shop)
 * and PRA (Punjab sales tax on services) use the PRAL-built "PostData" API:
 *   POST  {endpoint}            Authorization: Bearer {token}     Content-Type: application/json
 *   body  one invoice (fields below)
 *   reply { InvoiceNumber, Code, Response, Errors }   Code "100" = success
 *
 * IMPORTANT: this follows the publicly described PostData format. Confirm the field list,
 * PaymentMode codes and URLs against the technical document FBR/PRA gives you at
 * registration, and test in Sandbox before switching to Production. Everything that
 * may differ (URLs, PCT code, POS ID, token) is editable in Settings > Tax Integration.
 *
 * Contract used by the rest of the system (taxQueue.js):
 *   uploadInvoice(sale, integration) → { status: 'uploaded'|'failed'|'not_configured',
 *                                        taxInvoiceNumber?, response?, error?, retryable? }
 */
import Decimal from 'decimal.js';

export const NOT_CONFIGURED_MESSAGE = 'Not configured yet. Please fill in Settings > Tax Integration.';

/** Default PostData addresses. Can be overridden with "Custom API address" in Settings. */
export const DEFAULT_ENDPOINTS = {
  FBR: {
    sandbox: 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData',
    production: 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData',
  },
  PRA: {
    sandbox: 'https://ims.pral.com.pk/ims/sandbox/api/Live/PostData',
    production: 'https://ims.pral.com.pk/ims/production/api/Live/PostData',
  },
};

/** PostData PaymentMode codes (1 Cash, 2 Card, 3 Gift voucher, 4 Loyalty card, 5 Mixed, 6 Cheque). Confirm with your spec. */
export const PAYMENT_MODE = { cash: 1, card: 2, bank_transfer: 6 };
const INVOICE_TYPE_NEW = 1;
const SUCCESS_CODE = '100';
const TIMEOUT_MS = 20000;

export function authorityKey(integration) {
  return String(integration?.authority || integration?.authority_label || 'FBR').toUpperCase() === 'PRA' ? 'PRA' : 'FBR';
}

export function endpointFor(integration) {
  if (integration?.endpoint_url) return integration.endpoint_url;
  const env = integration?.environment === 'production' ? 'production' : 'sandbox';
  return DEFAULT_ENDPOINTS[authorityKey(integration)][env];
}

/** Which required settings are still missing (empty array = ready). */
export function missingSettings(integration) {
  const missing = [];
  if (!integration) return ['all settings'];
  if (!/^\d+$/.test(String(integration.pos_id || '').trim())) missing.push('POS ID (numbers only)');
  if (!integration.token) missing.push('Bearer token');
  if (!String(integration.default_pct_code || '').trim()) missing.push('Default PCT code');
  if (authorityKey(integration) === 'PRA' && !String(integration.pntn || '').trim()) missing.push('PNTN');
  return missing;
}

export function isConfigured(integration) {
  return missingSettings(integration).length === 0;
}

const D = (v) => new Decimal(v || 0);
const n2 = (d) => Number(D(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2));

/**
 * Build the PostData body for a sale. Pure function (unit tested).
 * Discount and tax are spread over the lines so line totals add up exactly to the invoice totals.
 */
export function buildPostDataPayload(sale, integration) {
  const lines = sale.lines || [];
  const subtotal = D(sale.subtotal);
  const discount = D(sale.discount);
  const taxTotal = D(sale.tax_amount);
  const rate = Number(D(sale.tax_percent));

  let discLeft = discount;
  let taxLeft = taxTotal;
  const items = lines.map((l, i) => {
    const last = i === lines.length - 1;
    const lineTotal = D(l.line_total);
    const share = subtotal.gt(0) ? lineTotal.div(subtotal) : new Decimal(0);
    const lineDisc = last ? discLeft : discount.times(share).toDecimalPlaces(2);
    const saleValue = lineTotal.minus(lineDisc);
    const lineTax = last ? taxLeft : saleValue.times(rate).div(100).toDecimalPlaces(2);
    discLeft = discLeft.minus(lineDisc);
    taxLeft = taxLeft.minus(lineTax);
    return {
      ItemCode: l.item_tag,
      ItemName: `${l.item_name} (${l.karat}K, ${D(l.gross_weight).toFixed(3)} g)`,
      Quantity: Number(l.quantity),
      PCTCode: String(integration.default_pct_code || '').trim(),
      TaxRate: rate,
      SaleValue: n2(saleValue),
      TotalAmount: n2(saleValue.plus(lineTax)),
      TaxCharged: n2(lineTax),
      Discount: n2(lineDisc),
      FurtherTax: 0,
      InvoiceType: INVOICE_TYPE_NEW,
      RefUSIN: null,
    };
  });

  const c = sale.customer || {};
  const walkIn = Boolean(c.is_walk_in);
  return {
    InvoiceNumber: '',
    POSID: Number(String(integration.pos_id).trim()),
    USIN: sale.invoice_number,
    DateTime: String(sale.created_at).slice(0, 19).replace('T', ' '),
    BuyerNTN: '',
    BuyerCNIC: walkIn ? '' : String(c.cnic || '').replace(/\D/g, ''),
    BuyerName: walkIn ? '' : c.name || '',
    BuyerPhoneNumber: walkIn ? '' : String(c.phone || '').replace(/\D/g, ''),
    TotalBillAmount: n2(sale.total_amount),
    TotalQuantity: lines.reduce((t, l) => t + Number(l.quantity), 0),
    TotalSaleValue: n2(subtotal.minus(discount)),
    TotalTaxCharged: n2(taxTotal),
    Discount: n2(discount),
    FurtherTax: 0,
    PaymentMode: PAYMENT_MODE[sale.payment_method] || 1,
    RefUSIN: null,
    InvoiceType: INVOICE_TYPE_NEW,
    Items: items,
  };
}

/** Plain-English explanation for common gateway errors. */
function explain(status, body, text) {
  const raw = `${body?.Response || ''} ${JSON.stringify(body?.Errors || '')} ${text || ''}`;
  if (status === 401 || /OAuth|Bearer/i.test(raw)) return 'The Bearer token was refused. Please check the token in Settings.';
  if (/900908|forbidden/i.test(raw) || status === 403)
    return 'Access refused (900908). The token or this computer\'s IP address is not approved by the tax authority yet.';
  if (status === 404 || status === 405) return 'The API address looks wrong. Please check it in Settings.';
  return body?.Response || body?.Errors || text?.slice(0, 300) || `Unexpected reply (HTTP ${status})`;
}

async function post(url, token, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadInvoice(sale, integration) {
  if (!isConfigured(integration)) return { status: 'not_configured' };
  const payload = buildPostDataPayload(sale, integration);
  let res;
  try {
    res = await post(endpointFor(integration), integration.token, payload);
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return {
      status: 'failed',
      retryable: true,
      error: timedOut
        ? 'No reply from the tax server (timed out). It will be retried; check the tax portal before re-sending by hand.'
        : `Could not reach the tax server: ${err.cause?.code || err.message}. Check the internet connection.`,
    };
  }
  const code = String(res.body?.Code ?? '');
  if (res.status >= 200 && res.status < 300 && code === SUCCESS_CODE && res.body?.InvoiceNumber) {
    return { status: 'uploaded', taxInvoiceNumber: String(res.body.InvoiceNumber), response: res.body };
  }
  return {
    status: 'failed',
    // Auth/IP/address problems will not fix themselves; server errors may.
    retryable: res.status >= 500,
    error: explain(res.status, res.body, res.text),
    response: res.body || { http_status: res.status, text: res.text?.slice(0, 1000) },
  };
}

/**
 * Test Connection.
 * Sandbox: posts a clearly-marked TEST invoice (sandbox data is not real).
 * Production: never posts; only checks the settings and that the server answers.
 */
export async function testConnection(integration) {
  const missing = missingSettings(integration);
  if (missing.length) return { ok: false, message: `Please fill in: ${missing.join(', ')}.` };
  const url = endpointFor(integration);

  if (integration.environment !== 'production') {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 8)}`;
    const testSale = {
      invoice_number: `TEST-${Date.now()}`,
      created_at: stamp,
      payment_method: 'cash',
      subtotal: '100.00',
      discount: '0.00',
      tax_percent: '3',
      tax_amount: '3.00',
      total_amount: '104.00',
      customer: { is_walk_in: true },
      lines: [{ item_tag: 'TEST', item_name: 'Connection test', karat: 22, gross_weight: '0.001', quantity: 1, line_total: '100.00' }],
    };
    const r = await uploadInvoice(testSale, integration);
    return r.status === 'uploaded'
      ? { ok: true, message: `Connected. Sandbox test invoice accepted (tax invoice no. ${r.taxInvoiceNumber}).` }
      : { ok: false, message: `Sandbox test failed: ${r.error}`, response: r.response };
  }

  // A GET is harmless: the gateway only accepts POST for PostData, so this sends no invoice.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${integration.token}` }, signal: ctrl.signal });
    const text = await res.text();
    if (res.status === 401 || /900908|forbidden|OAuth/i.test(text)) return { ok: false, message: explain(res.status, null, text) };
    return {
      ok: true,
      message: `The production server is reachable (HTTP ${res.status}). No invoice was sent. Make one real sale and check it shows "Uploaded" to confirm.`,
    };
  } catch (err) {
    return { ok: false, message: `Could not reach the production server: ${err.cause?.code || err.message}.` };
  } finally {
    clearTimeout(timer);
  }
}
