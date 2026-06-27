import type { Knex } from 'knex';

/**
 * Multi-vendor marketplace: products belong to stores, orders carry commission,
 * broadcast offers for open requests, vendor ownership on stores.
 */
export async function up(knex: Knex): Promise<void> {
  // ── stores: vendor ownership + commission ──────────────
  await knex.schema.alterTable('stores', (t) => {
    t.uuid('owner_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.decimal('commission_rate', 5, 2); // nullable → global default
    t.string('phone', 15);
    t.string('whatsapp', 15);
    t.index(['owner_user_id']);
  });

  // ── products → store ───────────────────────────────────
  await knex.schema.alterTable('products', (t) => {
    t.uuid('store_id').references('id').inTable('stores').onDelete('CASCADE');
    t.index(['store_id']);
  });

  // Back-fill existing products to the first store in their region (if any).
  const stores = await knex('stores').select('id', 'region_id');
  if (stores.length) {
    const defaultStore = stores[0].id;
    await knex('products').whereNull('store_id').update({ store_id: defaultStore });
  }

  // ── orders: commission + routing mode ──────────────────
  await knex.schema.alterTable('orders', (t) => {
    t.string('routing_mode', 20).notNullable().defaultTo('fixed'); // fixed | broadcast
    t.decimal('commission_rate', 5, 2).notNullable().defaultTo(0);
    t.decimal('platform_commission', 10, 2).notNullable().defaultTo(0);
    t.decimal('vendor_payout', 10, 2).notNullable().defaultTo(0);
  });

  // ── open requests (voice / unmatched search) ───────────
  await knex.schema.createTable('open_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('pincode', 10).notNullable();
    t.uuid('region_id').references('id').inTable('regions');
    t.text('request_text').notNullable();
    t.string('status', 20).notNullable().defaultTo('pending'); // pending|matched|confirmed|expired|cancelled
    t.uuid('matched_store_id').references('id').inTable('stores');
    t.uuid('matched_order_id').references('id').inTable('orders');
    t.decimal('quoted_price', 10, 2);
    t.timestamp('expires_at');
    t.timestamps(true, true);
    t.index(['user_id', 'created_at']);
    t.index(['status']);
  });

  // ── store order offers (broadcast + optional fixed-order tracking) ─
  await knex.schema.createTable('store_order_offers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('open_request_id').references('id').inTable('open_requests').onDelete('CASCADE');
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('status', 15).notNullable().defaultTo('offered'); // offered|accepted|rejected|expired
    t.decimal('quoted_price', 10, 2);
    t.timestamp('offered_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('responded_at');
    t.text('reject_reason');
    t.index(['store_id', 'status']);
    t.index(['open_request_id', 'status']);
  });

  await knex.raw(
    `CREATE UNIQUE INDEX uq_offer_active_request_store ON store_order_offers(open_request_id, store_id) WHERE status IN ('offered','accepted') AND open_request_id IS NOT NULL`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('store_order_offers');
  await knex.schema.dropTableIfExists('open_requests');
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('routing_mode');
    t.dropColumn('commission_rate');
    t.dropColumn('platform_commission');
    t.dropColumn('vendor_payout');
  });
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('store_id');
  });
  await knex.schema.alterTable('stores', (t) => {
    t.dropColumn('owner_user_id');
    t.dropColumn('commission_rate');
    t.dropColumn('phone');
    t.dropColumn('whatsapp');
  });
}
