import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('users').where({ phone: '9999900000', role: 'admin' }).update({ role: 'super_admin' });
  const storeRow = await knex('app_settings').where({ key: 'store' }).first();
  if (storeRow) {
    const val = typeof storeRow.value === 'string' ? JSON.parse(storeRow.value) : storeRow.value;
    if (val?.name?.en === 'Local Dukaan') {
      await knex('app_settings')
        .where({ key: 'store' })
        .update({
          value: JSON.stringify({
            name: { en: 'Zero', hi: 'ज़ीरो', mr: 'ज़ीरो' },
            tagline: val.tagline || { en: 'Your neighbourhood shops', hi: 'आपके मोहल्ले की दुकानें' },
          }),
        });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('users').where({ phone: '9999900000', role: 'super_admin' }).update({ role: 'admin' });
}
