import { db } from '../config/db';

export interface AppSetting {
  key: string;
  value: unknown;
}

export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const row = await db('app_settings').where({ key }).first();
  return row ? (row.value as T) : fallback;
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db('app_settings').select('key', 'value');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db('app_settings')
    .insert({ key, value: JSON.stringify(value), updated_at: db.fn.now() })
    .onConflict('key')
    .merge({ value: JSON.stringify(value), updated_at: db.fn.now() });
}
