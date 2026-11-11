/**
 * Initial data: admin, settings, 13 karat categories, Walk-in customer,
 * sample customers, items and sales so every page shows data on first run.
 *
 * SAFETY: this wipes all tables. It refuses to run on a database that already
 * has real sales unless SEED_FORCE=1 is set.
 */
import bcrypt from 'bcryptjs';
import { SETTING_DEFAULTS } from '../src/services/settings.js';
import { STANDARD_KARATS, factor8 } from '../src/services/goldRates.js';
import { applyDailyRate } from '../src/services/rates.js';
import { createSale } from '../src/services/sales.js';

/**
 * PLACEHOLDER 24K price per tola — NOT a real market price.
 * The admin is expected to enter today's real price on first use.
 */
const PLACEHOLDER_24K_PRICE_PER_TOLA = '400000';

const TABLES = [
  'audit_log',
  'tax_upload_queue',
  'customer_payments',
  'sale_items',
  'sales',
  'items',
  'customers',
  'gold_rate_history',
  'categories',
  'counters',
  'settings',
  'admin',
];

export async function seed(knex) {
  const hasSales = await knex('sales').count({ n: '*' }).first();
  if (Number(hasSales.n) > 0 && process.env.SEED_FORCE !== '1' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'The database already has sales. Seeding would ERASE everything. ' +
        'If you are sure, run again with SEED_FORCE=1 (for example: set SEED_FORCE=1 && npm run seed).',
    );
  }

  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await knex(t).truncate();
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');

  // ---- Admin ----
  await knex('admin').insert({
    name: 'Administrator',
    username: 'admin',
    password_hash: await bcrypt.hash('Admin@12345', 12),
    must_change_password: true,
  });

  // ---- Settings ----
  const settings = {
    ...SETTING_DEFAULTS,
    shop_name: 'Al-Noor Jewellers',
    shop_address: 'Shop 12, Gold Market, Anarkali, Lahore',
    shop_phone: '042-37654321',
    shop_email: 'info@example.com',
    ntn: '1234567-8',
    stn: '17-00-1234-567-89',
  };
  await knex('settings').insert(Object.entries(settings).map(([key, value]) => ({ key, value: JSON.stringify(value) })));
  await knex('counters').insert({ name: 'invoice', value: 0 });

  // ---- Categories (13 standard karats, prices filled by the rate below) ----
  await knex('categories').insert(
    STANDARD_KARATS.map((k) => ({ name: `${k}K`, karat: k, factor: factor8(k), price_per_tola: 0, price_per_gram: 0 })),
  );

  // ---- Placeholder rate, dated yesterday so the "price not set today" reminder shows ----
  await knex.transaction((trx) =>
    applyDailyRate(
      { price24k: PLACEHOLDER_24K_PRICE_PER_TOLA, note: 'PLACEHOLDER price from setup. Please enter the real price.' },
      trx,
    ),
  );
  await knex('gold_rate_history').update({ created_at: knex.raw('NOW() - INTERVAL 1 DAY') });

  // ---- Customers ----
  await knex('customers').insert({
    name: 'Walk-in Customer',
    cnic: '9999997-8',
    phone: '03000000000',
    is_walk_in: true,
  });
  const sampleCustomers = [
    { name: 'Muhammad Asif', cnic: '35202-1234567-1', phone: '0300-1234567', email: 'asif@example.com', address: 'Model Town, Lahore' },
    { name: 'Ayesha Khan', cnic: '35201-7654321-2', phone: '0321-7654321', email: null, address: 'Gulberg III, Lahore' },
    { name: 'Bilal Ahmed', cnic: '42101-1112223-3', phone: '0333-1112223', email: 'bilal@example.com', address: 'Clifton, Karachi', opening_balance: '15000.00' },
    { name: 'Fatima Noor', cnic: '61101-4445556-4', phone: '0345-4445556', email: null, address: 'F-7, Islamabad' },
    { name: 'Hamza Raza', cnic: '37405-9998887-5', phone: '0312-9998887', email: null, address: 'Saddar, Rawalpindi' },
  ];
  await knex('customers').insert(sampleCustomers);
  const customers = await knex('customers').select('id', 'name', 'is_walk_in').orderBy('id');
  const walkIn = customers.find((c) => c.is_walk_in);
  const cust = (name) => customers.find((c) => c.name === name).id;

  // ---- Items ----
  const cats = Object.fromEntries((await knex('categories').select('id', 'karat')).map((c) => [c.karat, c.id]));
  const items = [
    { name: 'Gold Chain (Rope design)', tag: 'CH0001', karat: 22, weight_grams: '6.720', quantity: 3 },
    { name: 'Gold Chain (Box design)', tag: 'CH0002', karat: 21, weight_grams: '10.250', quantity: 2 },
    { name: 'Gold Ring (Plain band)', tag: 'RI0001', karat: 22, weight_grams: '3.450', quantity: 5 },
    { name: 'Gold Ring (Stone)', tag: 'RI0002', karat: 18, weight_grams: '4.100', quantity: 1 },
    { name: 'Bangles (Pair)', tag: 'BA0001', karat: 22, weight_grams: '23.330', quantity: 2 },
    { name: 'Earrings (Jhumka)', tag: 'EA0001', karat: 21, weight_grams: '8.600', quantity: 4 },
    { name: 'Necklace Set (Bridal)', tag: 'NE0001', karat: 22, weight_grams: '58.320', quantity: 1 },
    { name: 'Pendant (Allah)', tag: 'PE0001', karat: 18, weight_grams: '2.150', quantity: 6 },
    { name: 'Nose Pin', tag: 'NO0001', karat: 18, weight_grams: '0.650', quantity: 0 },
    { name: 'Gold Bar 1 Tola', tag: 'GB0001', karat: 24, weight_grams: '11.664', quantity: 3 },
  ];
  await knex('items').insert(items.map(({ karat, ...i }) => ({ ...i, category_id: cats[karat] })));
  const itemId = async (tag) => (await knex('items').where({ tag }).first()).id;
  const cat = async (tag) =>
    (await knex('items as i').join('categories as c', 'c.id', 'i.category_id').where('i.tag', tag).select('c.price_per_gram').first())
      .price_per_gram;

  // ---- Sample sales (through the real sale logic) ----
  const daysAgo = async (n) => {
    const [[row]] = await knex.raw(
      "SELECT DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y-%m-%d') AS d, DATE_FORMAT(NOW() - INTERVAL ? DAY, '%Y-%m-%d %H:%i:%s') AS t",
      [n, n],
    );
    return { saleDate: row.d, createdAt: row.t };
  };

  await createSale(
    {
      customer_id: walkIn.id,
      payment_method: 'cash',
      discount: '0',
      cash_received: '200000',
      lines: [
        { item_id: await itemId('RI0001'), quantity: 1, wastage_type: 'grams', wastage_value: '0.300', rate_per_gram: await cat('RI0001'), making_charges: '3000' },
      ],
    },
    { db: knex, ...(await daysAgo(5)) },
  ).then(async ({ id }) => {
    // Make the walk-in sale fully paid with change returned.
    const s = await knex('sales').where({ id }).first();
    if (Number(s.balance) > 0) throw new Error('Seed: walk-in sale should be fully paid');
  });

  const credit = await createSale(
    {
      customer_id: cust('Muhammad Asif'),
      payment_method: 'cash',
      discount: '1000',
      cash_received: '150000',
      remarks: 'Balance to be paid next week',
      lines: [
        { item_id: await itemId('CH0001'), quantity: 1, wastage_type: 'grams', wastage_value: '0', rate_per_gram: await cat('CH0001'), making_charges: '5000' },
        { item_id: await itemId('PE0001'), quantity: 1, wastage_type: 'grams', wastage_value: '0.110', rate_per_gram: await cat('PE0001'), making_charges: '1500' },
      ],
    },
    { db: knex, ...(await daysAgo(2)) },
  );

  await createSale(
    {
      customer_id: cust('Ayesha Khan'),
      payment_method: 'card',
      bill_no: 'B-1043',
      discount: '0',
      cash_received: '250000',
      lines: [
        { item_id: await itemId('EA0001'), quantity: 1, wastage_type: 'grams', wastage_value: '0.500', rate_per_gram: await cat('EA0001'), making_charges: '4000', other_stone_charges: '2500' },
      ],
    },
    { db: knex, ...(await daysAgo(0)) },
  );

  // A later payment against the credit sale.
  await knex('customer_payments').insert({
    customer_id: cust('Muhammad Asif'),
    sale_id: credit.id,
    amount: '10000.00',
    method: 'cash',
    note: 'First instalment',
  });

  // Tax status for seed sales: integration not configured.
  await knex('sales').update({ tax_status: 'not_configured' });
  await knex('tax_upload_queue').update({ status: 'not_configured', last_error: 'Not configured yet. It will be set up later.' });
}
