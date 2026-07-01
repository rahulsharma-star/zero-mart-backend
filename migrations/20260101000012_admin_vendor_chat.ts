import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_vendor_chats', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id').notNullable().unique().references('id').inTable('stores').onDelete('CASCADE');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('admin_vendor_chat_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('chat_id').notNullable().references('id').inTable('admin_vendor_chats').onDelete('CASCADE');
    t.uuid('sender_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('message_type', 16).notNullable().defaultTo('text');
    t.text('body').nullable();
    t.string('audio_url', 512).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE INDEX admin_vendor_chat_messages_chat_created_idx ON admin_vendor_chat_messages (chat_id, created_at DESC)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_vendor_chat_messages');
  await knex.schema.dropTableIfExists('admin_vendor_chats');
}
