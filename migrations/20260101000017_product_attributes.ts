import type { Knex } from 'knex';

/**
 * Flexible per-product attributes (JSON) so different shop types can capture
 * what they need — e.g. clothing sizes, custom dimensions (L×W×H), toy age
 * group, colour, etc. Kept generic so the product form stays simple.
 *   attributes = { sizes: string[], dimensions: {l,w,h,unit}, age_group: string, ... }
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('products', 'attributes'))) {
    await knex.schema.alterTable('products', (t) => {
      t.jsonb('attributes').notNullable().defaultTo('{}');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('products', 'attributes')) {
    await knex.schema.alterTable('products', (t) => t.dropColumn('attributes'));
  }
}
