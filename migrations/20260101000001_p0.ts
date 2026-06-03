import type { Knex } from 'knex';

/**
 * P0 (MVP delta): regions + stores, delivery-boy system, expanded order
 * statuses + history, region pricing, refresh tokens, notifications outbox.
 * Converts users.role and orders.status from native enums to varchar so the
 * vocabulary can evolve without painful enum migrations (validated in app).
 */
export async function up(knex: Knex): Promise<void> {
  // ── regions ────────────────────────────────────────────
  await knex.schema.createTable('regions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 120).notNullable();
    t.string('city', 120).notNullable();
    t.string('state', 120);
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.string('timezone', 40).notNullable().defaultTo('Asia/Kolkata');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('stores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('region_id').notNullable().references('id').inTable('regions').onDelete('CASCADE');
    t.string('name', 120).notNullable();
    t.string('address', 300);
    t.decimal('lat', 10, 7);
    t.decimal('lng', 10, 7);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // service_pincodes: add region_id to the existing service_areas concept.
  await knex.schema.alterTable('service_areas', (t) => {
    t.uuid('region_id').references('id').inTable('regions').onDelete('CASCADE');
  });

  // ── region pricing ─────────────────────────────────────
  await knex.schema.createTable('region_pricing', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('region_id').notNullable().references('id').inTable('regions').onDelete('CASCADE');
    t.decimal('base_delivery_fee', 10, 2).notNullable().defaultTo(0);
    t.decimal('min_order_value', 10, 2).notNullable().defaultTo(0);
    t.decimal('free_delivery_above', 10, 2);
    t.decimal('surge_multiplier', 4, 2).notNullable().defaultTo(1.0);
    t.boolean('surge_active').notNullable().defaultTo(false);
    t.decimal('promo_discount', 10, 2).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['region_id', 'is_active']);
  });

  // ── users: role enum → varchar, add region_id ─────────
  await knex.raw(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`);
  await knex.raw(`ALTER TABLE users ALTER COLUMN role TYPE varchar(20) USING role::text`);
  await knex.raw(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer'`);
  await knex.raw(`UPDATE users SET role='delivery_boy' WHERE role='delivery'`);
  await knex.raw(`DROP TYPE IF EXISTS user_role`);
  await knex.schema.alterTable('users', (t) => {
    t.uuid('region_id').references('id').inTable('regions');
    t.index(['role']);
    t.index(['region_id']);
  });

  // ── delivery boys ──────────────────────────────────────
  await knex.schema.createTable('delivery_boys', (t) => {
    t.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('region_id').notNullable().references('id').inTable('regions');
    t.uuid('store_id').references('id').inTable('stores');
    t.string('vehicle_type', 30);
    t.string('vehicle_number', 20);
    t.string('id_proof_url', 500);
    t.string('availability', 10).notNullable().defaultTo('offline'); // online|offline|busy
    t.boolean('is_active').notNullable().defaultTo(true);
    t.decimal('rating_avg', 3, 2).notNullable().defaultTo(0);
    t.integer('total_deliveries').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['region_id', 'availability', 'is_active']);
  });

  // ── orders: status enum → varchar, add columns ────────
  await knex.raw(`ALTER TABLE orders ALTER COLUMN status DROP DEFAULT`);
  await knex.raw(`ALTER TABLE orders ALTER COLUMN status TYPE varchar(30) USING status::text`);
  await knex.raw(`ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'placed'`);
  await knex.raw(`UPDATE orders SET status='placed' WHERE status='pending'`);
  await knex.raw(`UPDATE orders SET status='preparing' WHERE status='packed'`);
  await knex.raw(`DROP TYPE IF EXISTS order_status`);
  await knex.schema.alterTable('orders', (t) => {
    t.uuid('region_id').references('id').inTable('regions');
    t.uuid('store_id').references('id').inTable('stores');
    t.timestamp('scheduled_at');
    t.timestamp('delivered_at');
    t.index(['region_id', 'status']);
  });

  // ── order status history ───────────────────────────────
  await knex.schema.createTable('order_status_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('from_status', 30);
    t.string('to_status', 30).notNullable();
    t.uuid('changed_by').references('id').inTable('users');
    t.text('reason');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['order_id', 'created_at']);
  });

  // ── delivery assignments ───────────────────────────────
  await knex.schema.createTable('delivery_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('delivery_boy_id').notNullable().references('user_id').inTable('delivery_boys');
    t.string('status', 15).notNullable().defaultTo('offered'); // offered|accepted|rejected|expired|completed
    t.timestamp('offered_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('responded_at');
    t.timestamp('picked_up_at');
    t.timestamp('delivered_at');
    t.text('reject_reason');
    t.string('proof_type', 20);
    t.string('proof_value', 500);
    t.string('delivery_otp_hash', 120);
    t.decimal('payout_amount', 10, 2).notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['delivery_boy_id', 'status']);
  });
  // one active assignment per order
  await knex.raw(
    `CREATE UNIQUE INDEX uq_da_active_order ON delivery_assignments(order_id) WHERE status IN ('offered','accepted')`
  );

  await knex.schema.createTable('delivery_earnings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('delivery_boy_id').notNullable().references('user_id').inTable('delivery_boys');
    t.uuid('assignment_id').references('id').inTable('delivery_assignments');
    t.decimal('amount', 10, 2).notNullable();
    t.string('type', 20).notNullable(); // delivery|bonus|adjustment
    t.text('note');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['delivery_boy_id', 'created_at']);
  });

  // ── refresh tokens ─────────────────────────────────────
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 120).notNullable();
    t.string('device_info', 200);
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id']);
  });

  // ── notifications outbox + device tokens ───────────────
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('channel', 10).notNullable().defaultTo('inapp'); // push|sms|email|inapp
    t.string('event', 40).notNullable();
    t.jsonb('title');
    t.jsonb('body');
    t.jsonb('data');
    t.string('status', 12).notNullable().defaultTo('pending'); // pending|sent|failed|read
    t.integer('retries').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('sent_at');
    t.index(['user_id', 'created_at']);
  });

  await knex.schema.createTable('device_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token', 300).notNullable().unique();
    t.string('platform', 10).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_tokens');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('delivery_earnings');
  await knex.schema.dropTableIfExists('delivery_assignments');
  await knex.schema.dropTableIfExists('order_status_history');
  await knex.schema.dropTableIfExists('delivery_boys');
  await knex.schema.dropTableIfExists('region_pricing');

  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('region_id');
    t.dropColumn('store_id');
    t.dropColumn('scheduled_at');
    t.dropColumn('delivered_at');
  });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('region_id');
  });
  await knex.schema.alterTable('service_areas', (t) => {
    t.dropColumn('region_id');
  });
  await knex.schema.dropTableIfExists('stores');
  await knex.schema.dropTableIfExists('regions');
  // status/role columns stay as varchar (no rollback to enum).
}
