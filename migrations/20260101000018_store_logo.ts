import type { Knex } from 'knex';

/** Per-shop branding: vendors can set their own logo (name already exists). */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('stores', 'logo_url'))) {
    await knex.schema.alterTable('stores', (t) => {
      t.string('logo_url', 500);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('stores', 'logo_url')) {
    await knex.schema.alterTable('stores', (t) => t.dropColumn('logo_url'));
  }
}
