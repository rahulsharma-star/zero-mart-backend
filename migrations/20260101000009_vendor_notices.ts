import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vendor_notices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.jsonb('message').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
  await knex.schema.raw('CREATE INDEX vendor_notices_store_active_idx ON vendor_notices (store_id, is_active)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vendor_notices');
}
