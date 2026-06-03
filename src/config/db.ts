import knex, { Knex } from 'knex';
import { env } from './env';

const config: Knex.Config = {
  client: 'pg',
  connection: env.databaseUrl,
  pool: { min: 2, max: 10 },
};

export const db: Knex = knex(config);

export async function pingDb(): Promise<void> {
  await db.raw('select 1');
}
