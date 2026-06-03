import type { Knex } from 'knex';

/**
 * Per-delivery-boy payout rate + manual payout ledger.
 * - delivery_boys.payout_per_order: per-boy rate (NULL = use global setting)
 * - delivery_payouts: money actually paid out to a boy (manual/out-of-band)
 *   Due (payable) = SUM(delivery_earnings) - SUM(delivery_payouts)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('delivery_boys', (t) => {
    t.decimal('payout_per_order', 10, 2); // nullable → falls back to global setting
  });

  await knex.schema.createTable('delivery_payouts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('delivery_boy_id').notNullable().references('user_id').inTable('delivery_boys').onDelete('CASCADE');
    t.decimal('amount', 10, 2).notNullable();
    t.string('method', 30); // cash|upi|bank|other
    t.text('note');
    t.uuid('paid_by').references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['delivery_boy_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('delivery_payouts');
  await knex.schema.alterTable('delivery_boys', (t) => {
    t.dropColumn('payout_per_order');
  });
}
