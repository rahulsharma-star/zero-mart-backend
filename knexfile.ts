import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const base: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

const config: { [key: string]: Knex.Config } = {
  development: base,
  production: base,
};

export default config;
