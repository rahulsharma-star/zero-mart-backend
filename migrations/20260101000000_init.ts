import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── users ──────────────────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('phone', 15).notNullable().unique();
    t.string('name', 120);
    t.string('email', 160);
    t.enu('role', ['customer', 'admin', 'delivery'], {
      useNative: true,
      enumName: 'user_role',
    })
      .notNullable()
      .defaultTo('customer');
    t.enu('language', ['en', 'hi'], { useNative: true, enumName: 'user_lang' })
      .notNullable()
      .defaultTo('en');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at');
    t.timestamps(true, true);
  });

  // ── otp_codes ──────────────────────────────────────────
  await knex.schema.createTable('otp_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('phone', 15).notNullable().index();
    t.string('code_hash').notNullable();
    t.enu('purpose', ['login', 'signup'], { useNative: true, enumName: 'otp_purpose' })
      .notNullable()
      .defaultTo('login');
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('expires_at').notNullable();
    t.timestamp('verified_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── addresses ──────────────────────────────────────────
  await knex.schema.createTable('addresses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('label', 40).defaultTo('Home');
    t.string('contact_name', 120);
    t.string('contact_phone', 15);
    t.string('line1', 240).notNullable();
    t.string('line2', 240);
    t.string('city', 120);
    t.string('pincode', 10).notNullable();
    t.decimal('lat', 10, 7);
    t.decimal('lng', 10, 7);
    t.boolean('is_default').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  // ── service_areas (pincode serviceability) ─────────────
  await knex.schema.createTable('service_areas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('pincode', 10).notNullable().unique();
    t.string('city', 120);
    t.string('area_name', 160);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ── categories ─────────────────────────────────────────
  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.jsonb('name').notNullable(); // { en, hi }
    t.string('slug', 160).notNullable().unique();
    t.string('image_url', 500);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ── products ───────────────────────────────────────────
  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('category_id').references('id').inTable('categories').onDelete('SET NULL');
    t.jsonb('name').notNullable(); // { en, hi }
    t.jsonb('description'); // { en, hi }
    t.string('slug', 200).notNullable().unique();
    t.string('unit', 60); // e.g. "1 kg", "500 ml", "pack of 6"
    t.decimal('price', 10, 2).notNullable();
    t.decimal('mrp', 10, 2);
    t.integer('stock').notNullable().defaultTo(0);
    t.string('image_url', 500);
    t.jsonb('images').defaultTo('[]'); // string[]
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('products', (t) => {
    t.index(['category_id']);
    t.index(['is_active']);
  });

  // ── cart_items ─────────────────────────────────────────
  await knex.schema.createTable('cart_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.integer('quantity').notNullable().defaultTo(1);
    t.timestamps(true, true);
    t.unique(['user_id', 'product_id']);
  });

  // ── orders ─────────────────────────────────────────────
  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('order_number', 24).notNullable().unique();
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.enu('status', ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'], {
      useNative: true,
      enumName: 'order_status',
    })
      .notNullable()
      .defaultTo('pending');
    t.enu('payment_status', ['pending', 'paid', 'failed', 'refunded'], {
      useNative: true,
      enumName: 'order_payment_status',
    })
      .notNullable()
      .defaultTo('pending');
    t.enu('payment_method', ['upi', 'card', 'cod'], {
      useNative: true,
      enumName: 'order_payment_method',
    }).notNullable();
    // address snapshot
    t.string('address_line1', 240).notNullable();
    t.string('address_line2', 240);
    t.string('address_city', 120);
    t.string('address_pincode', 10).notNullable();
    t.string('contact_name', 120);
    t.string('contact_phone', 15);
    // money
    t.decimal('subtotal', 10, 2).notNullable();
    t.decimal('delivery_fee', 10, 2).notNullable().defaultTo(0);
    t.decimal('discount', 10, 2).notNullable().defaultTo(0);
    t.decimal('total', 10, 2).notNullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.text('notes');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('orders', (t) => {
    t.index(['user_id']);
    t.index(['status']);
  });

  // ── order_items ────────────────────────────────────────
  await knex.schema.createTable('order_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('product_id').references('id').inTable('products').onDelete('SET NULL');
    t.jsonb('name').notNullable(); // snapshot { en, hi }
    t.string('unit', 60);
    t.string('image_url', 500);
    t.decimal('price', 10, 2).notNullable();
    t.integer('quantity').notNullable();
    t.decimal('line_total', 10, 2).notNullable();
  });

  // ── payments ───────────────────────────────────────────
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('gateway', 30).notNullable().defaultTo('payu');
    t.string('txnid', 64).notNullable().unique(); // our reference sent to PayU
    t.string('gateway_payment_id', 80); // mihpayid from PayU
    t.string('method', 30); // upi / card
    t.decimal('amount', 10, 2).notNullable();
    t.enu('status', ['pending', 'success', 'failed'], {
      useNative: true,
      enumName: 'payment_status',
    })
      .notNullable()
      .defaultTo('pending');
    t.jsonb('raw_response');
    t.timestamps(true, true);
  });

  // ── banners (home carousel) ────────────────────────────
  await knex.schema.createTable('banners', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.jsonb('title'); // { en, hi }
    t.string('image_url', 500).notNullable();
    t.string('action_type', 30); // 'category' | 'product' | 'url' | 'none'
    t.string('action_value', 240);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ── app_settings (key/value) ───────────────────────────
  await knex.schema.createTable('app_settings', (t) => {
    t.string('key', 80).primary();
    t.jsonb('value').notNullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings');
  await knex.schema.dropTableIfExists('banners');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('service_areas');
  await knex.schema.dropTableIfExists('addresses');
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('users');

  // native enum types
  for (const e of [
    'user_role',
    'user_lang',
    'otp_purpose',
    'order_status',
    'order_payment_status',
    'order_payment_method',
    'payment_status',
  ]) {
    await knex.raw(`DROP TYPE IF EXISTS ?? CASCADE`, [e]);
  }
}
