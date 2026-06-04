// (migration applied as batch 4 on 2026-06-04)
import type { Knex } from 'knex';

/**
 * Two features:
 *  1. Urgent (express) orders — customer can opt for urgent delivery at an
 *     extra charge decided by admin. Per-region rate in region_pricing.urgent_fee
 *     (NULL → global app_settings 'urgent_fee'). Order keeps a snapshot.
 *  2. Placeable promotional banners — each banner targets a screen + a slot
 *     (top / middle / bottom / footer), so admin can drop a thin promo strip
 *     anywhere in the app.
 */
export async function up(knex: Knex): Promise<void> {
  // ── urgent orders ──────────────────────────────────────
  await knex.schema.alterTable('orders', (t) => {
    t.boolean('is_urgent').notNullable().defaultTo(false);
    t.decimal('urgent_fee', 10, 2).notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('region_pricing', (t) => {
    t.decimal('urgent_fee', 10, 2); // nullable → falls back to global setting
  });

  // ── placeable banners ──────────────────────────────────
  await knex.schema.alterTable('banners', (t) => {
    t.string('screen', 40).notNullable().defaultTo('home'); // home|category|cart|orders|profile|...
    t.string('position', 20).notNullable().defaultTo('top'); // top|middle|bottom|footer
    t.index(['screen', 'position', 'is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('banners', (t) => {
    t.dropIndex(['screen', 'position', 'is_active']);
    t.dropColumn('screen');
    t.dropColumn('position');
  });
  await knex.schema.alterTable('region_pricing', (t) => {
    t.dropColumn('urgent_fee');
  });
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('is_urgent');
    t.dropColumn('urgent_fee');
  });
}
