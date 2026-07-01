import { Knex } from 'knex';
import { db } from '../config/db';
import { ApiError } from './ApiError';

export function normalizeShopCode(code: string): string {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function baseFromName(name: string): string {
  const b = String(name || 'SHOP')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  return b || 'SHOP';
}

/** Generate a unique shop code like RAMU42 */
export async function generateShopCode(trx: Knex | Knex.Transaction, name: string, preferred?: string): Promise<string> {
  const normalized = preferred ? normalizeShopCode(preferred) : '';
  if (normalized.length >= 4) {
    const taken = await trx('stores').where({ shop_code: normalized }).first();
    if (!taken) return normalized;
    throw new ApiError(409, 'shop.code_taken');
  }
  const base = baseFromName(name);
  for (let i = 0; i < 40; i++) {
    const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = `${base}${suffix}`.slice(0, 10);
    const taken = await trx('stores').where({ shop_code: code }).first();
    if (!taken) return code;
  }
  return `Z${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export async function findStoreByCode(code: string) {
  const normalized = normalizeShopCode(code);
  if (normalized.length < 4) return null;
  return db('stores').where({ shop_code: normalized, is_active: true }).first();
}

export async function applyShopCodeToUser(userId: string, code: string | null | undefined) {
  if (!code) {
    await db('users').where({ id: userId }).update({ preferred_store_ids: JSON.stringify([]) });
    return null;
  }
  const store = await findStoreByCode(code);
  if (!store) throw new ApiError(404, 'shop.code_invalid');
  await db('users').where({ id: userId }).update({ preferred_store_ids: JSON.stringify([store.id]) });
  return store;
}
