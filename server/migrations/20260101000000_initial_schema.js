/**
 * Initial schema for GoldLedger.
 * Money: DECIMAL(14,2) · Weights: DECIMAL(10,3) · Rates: DECIMAL(14,4)
 */

function timestamps(knex, t) {
  t.datetime('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  t.datetime('updated_at')
    .notNullable()
    .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
}

export async function up(knex) {
  await knex.schema.createTable('admin', (t) => {
    t.increments('id').primary();
    t.string('name', 120).notNullable().defaultTo('Administrator');
    t.string('username', 60).notNullable().unique();
    t.string('password_hash', 120).notNullable();
    t.boolean('must_change_password').notNullable().defaultTo(true);
    t.integer('token_version').unsigned().notNullable().defaultTo(0);
    t.datetime('last_login_at').nullable();
    timestamps(knex, t);
  });

  await knex.schema.createTable('settings', (t) => {
    t.increments('id').primary();
    t.string('key', 80).notNullable().unique();
    t.text('value').nullable();
    timestamps(knex, t);
  });

  await knex.schema.createTable('counters', (t) => {
    t.string('name', 60).primary();
    t.integer('value').unsigned().notNullable().defaultTo(0);
  });

  await knex.schema.createTable('categories', (t) => {
    t.increments('id').primary();
    t.string('name', 60).notNullable().unique();
    t.integer('karat').unsigned().notNullable();
    t.decimal('factor', 10, 8).notNullable();
    t.decimal('price_per_tola', 14, 4).notNullable().defaultTo(0);
    t.decimal('price_per_gram', 14, 4).notNullable().defaultTo(0);
    t.boolean('is_manual_override').notNullable().defaultTo(false);
    t.enu('status', ['active', 'inactive']).notNullable().defaultTo('active');
    timestamps(knex, t);
    t.index(['status']);
    t.index(['karat']);
  });

  await knex.schema.createTable('gold_rate_history', (t) => {
    t.increments('id').primary();
    t.decimal('price_24k_per_tola', 14, 4).notNullable();
    t.boolean('applied_to_all').notNullable().defaultTo(true);
    t.string('note', 255).nullable();
    t.datetime('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    t.index(['created_at']);
  });

  await knex.schema.createTable('customers', (t) => {
    t.increments('id').primary();
    t.string('name', 150).notNullable();
    t.string('cnic', 20).nullable().unique();
    t.string('phone', 20).nullable();
    t.string('email', 150).nullable();
    t.string('address', 255).nullable();
    t.decimal('opening_balance', 14, 2).notNullable().defaultTo(0);
    t.enu('status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.boolean('is_walk_in').notNullable().defaultTo(false);
    t.datetime('deleted_at').nullable();
    timestamps(knex, t);
    t.index(['name']);
    t.index(['phone']);
    t.index(['deleted_at']);
  });

  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();
    t.string('name', 150).notNullable();
    t.string('tag', 40).notNullable().unique();
    t.integer('category_id').unsigned().notNullable().references('id').inTable('categories').onDelete('RESTRICT');
    t.decimal('weight_grams', 10, 3).notNullable();
    t.integer('quantity').unsigned().notNullable().defaultTo(1);
    t.enu('status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.datetime('deleted_at').nullable();
    timestamps(knex, t);
    t.index(['name']);
    t.index(['deleted_at']);
  });

  await knex.schema.createTable('sales', (t) => {
    t.increments('id').primary();
    t.string('invoice_number', 40).notNullable().unique();
    t.date('sale_date').notNullable();
    t.integer('customer_id').unsigned().notNullable().references('id').inTable('customers').onDelete('RESTRICT');
    t.enu('payment_method', ['cash', 'card', 'bank_transfer']).notNullable().defaultTo('cash');
    t.string('bill_no', 60).nullable();
    t.string('remarks', 500).nullable();
    t.decimal('gold_rate_24k_snapshot', 14, 4).notNullable();
    t.decimal('grams_per_tola_snapshot', 10, 4).notNullable();
    t.decimal('subtotal', 14, 2).notNullable();
    t.decimal('discount', 14, 2).notNullable().defaultTo(0);
    t.decimal('tax_percent', 6, 2).notNullable().defaultTo(0);
    t.decimal('tax_amount', 14, 2).notNullable().defaultTo(0);
    t.decimal('pos_service_fee', 14, 2).notNullable().defaultTo(0);
    t.decimal('card_fee', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_amount', 14, 2).notNullable();
    t.decimal('cash_received', 14, 2).notNullable().defaultTo(0);
    t.decimal('balance', 14, 2).notNullable().defaultTo(0);
    t.enu('status', ['active', 'void']).notNullable().defaultTo('active');
    t.string('void_reason', 500).nullable();
    t.datetime('voided_at').nullable();
    t.enu('tax_status', ['not_configured', 'pending', 'uploaded', 'failed']).notNullable().defaultTo('pending');
    t.string('tax_invoice_number', 100).nullable();
    t.json('tax_response').nullable();
    t.datetime('tax_uploaded_at').nullable();
    timestamps(knex, t);
    t.index(['sale_date']);
    t.index(['status']);
    t.index(['customer_id', 'status']);
  });

  await knex.schema.createTable('sale_items', (t) => {
    t.increments('id').primary();
    t.integer('sale_id').unsigned().notNullable().references('id').inTable('sales').onDelete('CASCADE');
    t.integer('item_id').unsigned().nullable().references('id').inTable('items').onDelete('SET NULL');
    t.string('item_tag', 40).notNullable();
    t.string('item_name', 150).notNullable();
    t.integer('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.string('category_name', 60).nullable();
    t.integer('karat').unsigned().notNullable();
    t.decimal('weight_grams', 10, 3).notNullable();
    t.enu('wastage_type', ['karat_wise', 'grams']).notNullable().defaultTo('grams');
    t.decimal('wastage_value', 10, 3).notNullable().defaultTo(0);
    t.decimal('wastage_grams', 10, 3).notNullable().defaultTo(0);
    t.decimal('gross_weight', 10, 3).notNullable();
    t.integer('quantity').unsigned().notNullable().defaultTo(1);
    t.decimal('rate_per_gram_snapshot', 14, 4).notNullable();
    t.decimal('rate_per_tola_snapshot', 14, 4).notNullable();
    t.decimal('making_charges', 14, 2).notNullable().defaultTo(0);
    t.decimal('other_stone_charges', 14, 2).notNullable().defaultTo(0);
    t.decimal('gold_received_value', 14, 2).notNullable().defaultTo(0);
    t.decimal('line_total', 14, 2).notNullable();
    timestamps(knex, t);
    t.index(['sale_id']);
  });

  await knex.schema.createTable('customer_payments', (t) => {
    t.increments('id').primary();
    t.integer('customer_id').unsigned().notNullable().references('id').inTable('customers').onDelete('RESTRICT');
    t.integer('sale_id').unsigned().nullable().references('id').inTable('sales').onDelete('SET NULL');
    t.decimal('amount', 14, 2).notNullable();
    t.enu('method', ['cash', 'card', 'bank_transfer']).notNullable().defaultTo('cash');
    t.string('note', 255).nullable();
    t.datetime('paid_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    timestamps(knex, t);
    t.index(['customer_id']);
  });

  await knex.schema.createTable('tax_upload_queue', (t) => {
    t.increments('id').primary();
    t.integer('sale_id').unsigned().notNullable().references('id').inTable('sales').onDelete('CASCADE');
    t.integer('attempts').unsigned().notNullable().defaultTo(0);
    t.text('last_error').nullable();
    t.datetime('next_attempt_at').nullable();
    t.enu('status', ['pending', 'processing', 'uploaded', 'failed', 'not_configured', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    timestamps(knex, t);
    t.index(['status', 'next_attempt_at']);
    t.index(['sale_id']);
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.string('action', 40).notNullable();
    t.string('entity', 40).notNullable();
    t.integer('entity_id').unsigned().nullable();
    t.json('details').nullable();
    t.datetime('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    t.index(['entity', 'entity_id']);
    t.index(['created_at']);
  });
}

export async function down(knex) {
  for (const table of [
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
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
