import type { Knex } from 'knex';

/**
 * V2 business rules:
 *  - products.extra_charge : vendor's per-product markup added to the base price.
 *  - users.pending_cancel_fee : ₹ owed on the customer's NEXT order because they
 *    cancelled an order that had already moved past "placed" (into processing).
 *  - orders.cancel_fee : the penalty actually applied to a given order.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (t) => {
    t.decimal('extra_charge', 10, 2).notNullable().defaultTo(0);
  });
  await knex.schema.alterTable('users', (t) => {
    t.decimal('pending_cancel_fee', 10, 2).notNullable().defaultTo(0);
  });
  await knex.schema.alterTable('orders', (t) => {
    t.decimal('cancel_fee', 10, 2).notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (t) => t.dropColumn('extra_charge'));
  await knex.schema.alterTable('users', (t) => t.dropColumn('pending_cancel_fee'));
  await knex.schema.alterTable('orders', (t) => t.dropColumn('cancel_fee'));
}
