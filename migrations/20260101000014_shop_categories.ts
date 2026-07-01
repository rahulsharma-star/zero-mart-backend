import type { Knex } from 'knex';

/**
 * Shop-scoped categories + "featured on home".
 *  - store_id: which shop owns the category (NULL = global/admin legacy category).
 *  - featured: shown on the customer home screen.
 *  - feature_status: vendor can request a category be featured; admin approves.
 *
 * Existing (global) categories are kept featured so the home screen keeps working.
 */
export async function up(knex: Knex): Promise<void> {
  const hasStore = await knex.schema.hasColumn('categories', 'store_id');
  if (!hasStore) {
    await knex.schema.alterTable('categories', (t) => {
      t.uuid('store_id').references('id').inTable('stores').onDelete('CASCADE');
      t.boolean('featured').notNullable().defaultTo(false);
      t.enu('feature_status', ['none', 'requested', 'approved', 'rejected'], {
        useNative: true,
        enumName: 'category_feature_status',
      })
        .notNullable()
        .defaultTo('none');
      t.index(['store_id']);
    });
    // Keep the current (global) categories visible on home.
    await knex('categories').whereNull('store_id').update({ featured: true, feature_status: 'approved' });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (t) => {
    t.dropColumn('store_id');
    t.dropColumn('featured');
    t.dropColumn('feature_status');
  });
  await knex.raw('DROP TYPE IF EXISTS category_feature_status');
}
