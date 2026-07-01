import type { Knex } from 'knex';

/**
 * Khata (udhaar / shop credit).
 *  - Adds a 'khata' payment method to orders.
 *  - khata_accounts : per (store, customer) credit limit + running balance owed.
 *  - khata_entries  : ledger of debits (orders) and credits (repayments).
 *
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction, so this migration
 * opts out of the automatic wrapping transaction.
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  // Allow "pay on khata" as an order payment method.
  await knex.raw(`ALTER TYPE order_payment_method ADD VALUE IF NOT EXISTS 'khata'`);

  const hasAccounts = await knex.schema.hasTable('khata_accounts');
  if (!hasAccounts) {
    await knex.schema.createTable('khata_accounts', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
      t.uuid('customer_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.decimal('credit_limit', 10, 2).notNullable().defaultTo(0);
      t.decimal('balance', 10, 2).notNullable().defaultTo(0); // amount currently owed
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.unique(['store_id', 'customer_user_id']);
    });
  }

  const hasEntries = await knex.schema.hasTable('khata_entries');
  if (!hasEntries) {
    await knex.schema.createTable('khata_entries', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('khata_account_id').notNullable().references('id').inTable('khata_accounts').onDelete('CASCADE');
      t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
      t.enu('type', ['debit', 'credit'], { useNative: true, enumName: 'khata_entry_type' }).notNullable();
      t.decimal('amount', 10, 2).notNullable();
      t.text('note');
      t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.index(['khata_account_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('khata_entries');
  await knex.schema.dropTableIfExists('khata_accounts');
  await knex.raw('DROP TYPE IF EXISTS khata_entry_type');
  // Note: the 'khata' enum value on order_payment_method is left in place
  // (Postgres cannot easily drop a single enum value).
}
