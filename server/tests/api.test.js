import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { clearSettingsCache } from '../src/services/settings.js';

const app = createApp();
let agent;

beforeAll(async () => {
  clearSettingsCache();
  await db.seed.run();
  agent = request.agent(app);
});
afterAll(() => db.destroy());

describe('auth', () => {
  it('blocks protected routes without login', async () => {
    for (const path of ['/api/customers', '/api/items', '/api/sales', '/api/settings', '/api/reports/dashboard']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body.message).toBeTruthy();
    }
  });

  it('rejects a wrong password with a friendly message', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not correct/);
  });

  it('validates missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.username).toBeTruthy();
  });

  it('logs in with the seeded admin and sets an httpOnly cookie', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'admin', password: 'Admin@12345' });
    expect(res.status).toBe(200);
    expect(res.body.admin.must_change_password).toBe(true);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.admin.username).toBe('admin');
  });
});

describe('protected API once logged in', () => {
  it('lists customers with derived balances', async () => {
    const res = await agent.get('/api/customers?pageSize=50');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    const walkIn = res.body.data.find((c) => c.is_walk_in);
    expect(walkIn.name).toBe('Walk-in Customer');
  });

  it('cannot delete the Walk-in customer', async () => {
    const list = await agent.get('/api/customers?pageSize=50');
    const walkIn = list.body.data.find((c) => c.is_walk_in);
    const res = await agent.delete(`/api/customers/${walkIn.id}`);
    expect(res.status).toBe(400);
  });

  it('validates and formats CNIC and mobile number', async () => {
    const bad = await agent.post('/api/customers').send({ name: 'Test Person', cnic: '123', phone: '12345' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.cnic).toBeTruthy();
    expect(bad.body.errors.phone).toBeTruthy();
    const ok = await agent.post('/api/customers').send({ name: 'Test Person', cnic: '3520299999991', phone: '03001112233' });
    expect(ok.status).toBe(201);
    expect(ok.body.customer.cnic).toBe('35202-9999999-1');
    expect(ok.body.customer.phone).toBe('0300-1112233');
  });

  it('applies a daily rate and reports it as current', async () => {
    const res = await agent.post('/api/categories/apply-daily-rate').send({ price_24k_per_tola: '450000' });
    expect(res.status).toBe(200);
    const cur = await agent.get('/api/gold-rates/current');
    expect(cur.body.is_set_today).toBe(true);
    expect(cur.body.current.price_24k_per_tola).toBe('450000.0000');
  });

  it('creates a sale through the API and decrements stock', async () => {
    const items = await agent.get('/api/items/lookup?q=RI0001');
    const ring = items.body.data[0];
    const customers = await agent.get('/api/customers/options?search=Ayesha');
    const res = await agent.post('/api/sales').send({
      customer_id: customers.body.data[0].id,
      payment_method: 'cash',
      cash_received: '1000',
      lines: [{ item_id: ring.id, quantity: 1, wastage_type: 'grams', wastage_value: '0.2', rate_per_gram: ring.category_price_per_gram, making_charges: '2000' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.invoice_number).toMatch(/^INV-\d{6}$/);
    expect(res.body.sale.gold_rate_24k_snapshot).toBe('450000.0000');
    expect(res.body.sale.tax_status).toBe('not_configured');
    const after = await agent.get(`/api/items/${ring.id}`);
    expect(after.body.item.quantity).toBe(ring.quantity - 1);

    const resend = await agent.post(`/api/sales/${res.body.sale.id}/resend-tax`);
    expect(resend.status).toBe(200);
    expect(resend.body.tax_status).toBe('not_configured');
  });

  it('rejects an invalid sale with field errors', async () => {
    const res = await agent.post('/api/sales').send({ customer_id: 1, lines: [] });
    expect(res.status).toBe(400);
    expect(res.body.errors.lines).toBeTruthy();
  });

  it('serves reports and a database backup', async () => {
    const dash = await agent.get('/api/reports/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.counts.categories).toBe(13);
    const chart = await agent.get('/api/reports/dashboard/chart?range=7d');
    expect(chart.body.data).toHaveLength(7);
    const backup = await agent.get('/api/backup');
    expect(backup.status).toBe(200);
    expect(backup.text).toMatch(/CREATE TABLE `sales`/);
  });

  it('tax integration: test connection lists missing settings, and saving them marks it ready', async () => {
    const res = await agent.post('/api/settings/tax-integration/test');
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/POS ID/);
    const bad = await agent.put('/api/settings/tax-integration').send({ authority: 'FBR', pos_id: 'abc' });
    expect(bad.status).toBe(400);
    const ok = await agent.put('/api/settings/tax-integration').send({
      authority: 'FBR',
      pos_id: '123456',
      default_pct_code: '7113.1910',
      token: 'secret-token-value',
      environment: 'sandbox',
      auto_upload: false,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.settings.tax_integration.is_configured).toBe(true);
    expect(JSON.stringify(ok.body)).not.toContain('secret-token-value');
    // Put it back so later tests run "not configured".
    await agent.put('/api/settings/tax-integration').send({ authority: 'FBR', pos_id: '', default_pct_code: '', token: '' });
  });

  it('changes the password and old sessions stop working', async () => {
    const res = await agent
      .post('/api/auth/change-password')
      .send({ current_password: 'Admin@12345', new_password: 'NewPass@2026', confirm_password: 'NewPass@2026' });
    expect(res.status).toBe(200);
    expect(res.body.admin.must_change_password).toBe(false);
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'NewPass@2026' });
    expect(login.status).toBe(200);
  });

  it('logs out', async () => {
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/customers');
    expect(res.status).toBe(401);
  });
});
