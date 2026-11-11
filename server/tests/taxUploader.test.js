import { describe, it, expect, vi, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  buildPostDataPayload,
  uploadInvoice,
  isConfigured,
  missingSettings,
  endpointFor,
  DEFAULT_ENDPOINTS,
} from '../src/services/taxUploader.js';

const integration = {
  authority: 'FBR',
  pos_id: '123456',
  token: 'test-token',
  default_pct_code: '7113.1910',
  environment: 'sandbox',
  auto_upload: true,
};

const sale = {
  invoice_number: 'INV-000042',
  created_at: '2026-11-12 14:05:09',
  payment_method: 'card',
  subtotal: '300000.00',
  discount: '1000.00',
  tax_percent: '3.00',
  tax_amount: '8970.00',
  total_amount: '307971.00',
  customer: { name: 'Muhammad Asif', cnic: '35202-1234567-1', phone: '0300-1234567', is_walk_in: false },
  lines: [
    { item_tag: 'CH0001', item_name: 'Gold Chain', karat: 22, gross_weight: '6.720', quantity: 1, line_total: '200000.00' },
    { item_tag: 'RI0001', item_name: 'Gold Ring', karat: 22, gross_weight: '3.333', quantity: 2, line_total: '100000.00' },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('configuration', () => {
  it('lists what is missing', () => {
    expect(isConfigured(integration)).toBe(true);
    expect(missingSettings({ ...integration, token: null })).toContain('Bearer token');
    expect(missingSettings({ ...integration, pos_id: 'abc' })).toContain('POS ID (numbers only)');
    expect(missingSettings({ ...integration, authority: 'PRA' })).toContain('PNTN');
  });

  it('picks the right address for authority + environment, or the custom one', () => {
    expect(endpointFor(integration)).toBe(DEFAULT_ENDPOINTS.FBR.sandbox);
    expect(endpointFor({ ...integration, environment: 'production' })).toBe(DEFAULT_ENDPOINTS.FBR.production);
    expect(endpointFor({ ...integration, authority: 'PRA' })).toBe(DEFAULT_ENDPOINTS.PRA.sandbox);
    expect(endpointFor({ ...integration, endpoint_url: 'https://custom.example/PostData' })).toBe('https://custom.example/PostData');
  });
});

describe('buildPostDataPayload', () => {
  const p = buildPostDataPayload(sale, integration);

  it('maps the invoice header', () => {
    expect(p.POSID).toBe(123456);
    expect(p.USIN).toBe('INV-000042');
    expect(p.DateTime).toBe('2026-11-12 14:05:09');
    expect(p.BuyerCNIC).toBe('3520212345671');
    expect(p.BuyerPhoneNumber).toBe('03001234567');
    expect(p.PaymentMode).toBe(2);
    expect(p.TotalBillAmount).toBe(307971);
    expect(p.TotalSaleValue).toBe(299000);
    expect(p.TotalTaxCharged).toBe(8970);
    expect(p.TotalQuantity).toBe(3);
    expect(p.InvoiceType).toBe(1);
  });

  it('item discount and tax add up exactly to the invoice totals', () => {
    const sum = (k) => p.Items.reduce((t, i) => t.plus(i[k]), new Decimal(0)).toNumber();
    expect(sum('Discount')).toBe(1000);
    expect(sum('TaxCharged')).toBe(8970);
    expect(sum('SaleValue')).toBe(299000);
    expect(p.Items[0].PCTCode).toBe('7113.1910');
  });

  it('sends no buyer details for the Walk-in customer', () => {
    const w = buildPostDataPayload({ ...sale, customer: { name: 'Walk-in Customer', cnic: '9999997-8', is_walk_in: true } }, integration);
    expect(w.BuyerCNIC).toBe('');
    expect(w.BuyerName).toBe('');
  });
});

describe('uploadInvoice', () => {
  const mockFetch = (status, body) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })),
    );

  it('does nothing when not configured', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await uploadInvoice(sale, { ...integration, token: null })).status).toBe('not_configured');
    expect(f).not.toHaveBeenCalled();
  });

  it('posts with the Bearer token and returns the tax invoice number on code 100', async () => {
    mockFetch(200, { InvoiceNumber: '123456ABCD1234567890', Code: '100', Response: 'Fiscal Invoice Number generated successfully.' });
    const r = await uploadInvoice(sale, integration);
    expect(r.status).toBe('uploaded');
    expect(r.taxInvoiceNumber).toBe('123456ABCD1234567890');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(DEFAULT_ENDPOINTS.FBR.sandbox);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(opts.body).USIN).toBe('INV-000042');
  });

  it('reports a rejected invoice as failed, not retried', async () => {
    mockFetch(200, { InvoiceNumber: '', Code: '401', Response: 'Invalid PCT Code' });
    const r = await uploadInvoice(sale, integration);
    expect(r.status).toBe('failed');
    expect(r.retryable).toBe(false);
    expect(r.error).toMatch(/PCT/);
  });

  it('explains the IP / token error 900908', async () => {
    mockFetch(403, 'Access failure for API: /FBR/v1, version: v1 status: (900908) - Resource forbidden');
    const r = await uploadInvoice(sale, integration);
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/IP address/);
  });

  it('retries later when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))));
    const r = await uploadInvoice(sale, integration);
    expect(r.status).toBe('failed');
    expect(r.retryable).toBe(true);
  });
});
