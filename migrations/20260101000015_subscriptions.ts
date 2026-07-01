import type { Knex } from 'knex';

/**
 * Vendor subscriptions (admin's recurring income).
 *  - subscription_plans : admin-defined plans (price + duration).
 *  - vendor_subscriptions : which plan a shop is on + status/expiry (trial on signup).
 *  - payments.subscription_id : lets the existing PayU flow pay for a subscription.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('subscription_plans'))) {
    await knex.schema.createTable('subscription_plans', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name', 120).notNullable();
      t.decimal('price', 10, 2).notNullable().defaultTo(0);
      t.integer('duration_days').notNullable().defaultTo(30);
      t.integer('max_products'); // NULL = unlimited
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('sort_order').notNullable().defaultTo(0);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('vendor_subscriptions'))) {
    await knex.schema.createTable('vendor_subscriptions', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
      t.uuid('plan_id').references('id').inTable('subscription_plans').onDelete('SET NULL');
      t.enu('status', ['trial', 'pending', 'active', 'expired'], {
        useNative: true,
        enumName: 'subscription_status',
      })
        .notNullable()
        .defaultTo('trial');
      t.timestamp('started_at');
      t.timestamp('expires_at');
      t.timestamps(true, true);
      t.index(['store_id']);
    });
  }

  if (!(await knex.schema.hasColumn('payments', 'subscription_id'))) {
    await knex.schema.alterTable('payments', (t) => {
      t.uuid('order_id').nullable().alter(); // order OR subscription payment
      t.uuid('subscription_id').references('id').inTable('vendor_subscriptions').onDelete('SET NULL');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('payments', 'subscription_id')) {
    await knex.schema.alterTable('payments', (t) => t.dropColumn('subscription_id'));
  }
  await knex.schema.dropTableIfExists('vendor_subscriptions');
  await knex.schema.dropTableIfExists('subscription_plans');
  await knex.raw('DROP TYPE IF EXISTS subscription_status');
}
