import type { Knex } from 'knex';

/**
 * Vendor banners / ads with admin approval.
 *  - owner_user_id : vendor who created it (null = admin-created).
 *  - store_id      : the shop the banner belongs to (null = global/home admin banner).
 *  - placement     : 'shop' (shows on that shop's page) | 'home' (shows on home).
 *  - status        : 'approved' | 'pending' | 'rejected'.
 *
 * Shop banners are auto-approved (vendor's own page). HOME banners created by a
 * vendor start as 'pending' and must be approved by admin (admin charges for home).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('banners', (t) => {
    t.uuid('owner_user_id').references('id').inTable('users').onDelete('CASCADE');
    t.uuid('store_id').references('id').inTable('stores').onDelete('CASCADE');
    t.string('placement', 20).notNullable().defaultTo('home');
    t.string('status', 15).notNullable().defaultTo('approved');
    t.index(['status']);
    t.index(['store_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('banners', (t) => {
    t.dropColumn('owner_user_id');
    t.dropColumn('store_id');
    t.dropColumn('placement');
    t.dropColumn('status');
  });
}
