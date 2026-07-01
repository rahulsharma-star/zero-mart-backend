import type { Knex } from 'knex';

/**
 * Seed a few sensible default subscription plans (only if none exist yet).
 * Admin can edit/add/remove these from the Subscriptions page.
 */
export async function up(knex: Knex): Promise<void> {
  const [{ count }] = await knex('subscription_plans').count<{ count: string }[]>('id as count');
  if (Number(count) > 0) return;

  await knex('subscription_plans').insert([
    { name: 'Monthly', price: 99, duration_days: 30, max_products: null, is_active: true, sort_order: 1 },
    { name: 'Quarterly (3 months)', price: 249, duration_days: 90, max_products: null, is_active: true, sort_order: 2 },
    { name: 'Yearly', price: 799, duration_days: 365, max_products: null, is_active: true, sort_order: 3 },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('subscription_plans')
    .whereIn('name', ['Monthly', 'Quarterly (3 months)', 'Yearly'])
    .del();
}
