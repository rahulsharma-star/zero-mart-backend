import type { Knex } from 'knex';

function baseFromName(name: string): string {
  const b = String(name || 'SHOP')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  return b || 'SHOP';
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stores', (t) => {
    t.string('shop_code', 12).unique();
  });

  const stores = await knex('stores').select('id', 'name');
  const used = new Set<string>();
  for (const s of stores) {
    let code = '';
    for (let attempt = 0; attempt < 30; attempt++) {
      const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const candidate = `${baseFromName(s.name)}${suffix}`.slice(0, 10);
      if (!used.has(candidate)) {
        code = candidate;
        used.add(candidate);
        break;
      }
    }
    if (code) await knex('stores').where({ id: s.id }).update({ shop_code: code });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stores', (t) => {
    t.dropColumn('shop_code');
  });
}
