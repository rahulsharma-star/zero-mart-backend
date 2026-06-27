import type { Knex } from 'knex';

/**
 * Customer preference: pin one or more shops. When set, the catalog (products +
 * shops) is filtered to only those shops everywhere the customer browses.
 * Empty array = no filter (show everything).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.jsonb('preferred_store_ids').notNullable().defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('preferred_store_ids');
  });
}
