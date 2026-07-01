import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_chat_messages', (t) => {
    t.string('message_type', 16).notNullable().defaultTo('text');
    t.string('audio_url', 512).nullable();
  });
  await knex.schema.raw('ALTER TABLE product_chat_messages ALTER COLUMN body DROP NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_chat_messages', (t) => {
    t.dropColumn('message_type');
    t.dropColumn('audio_url');
  });
}
