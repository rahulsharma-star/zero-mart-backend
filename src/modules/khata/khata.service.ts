import { Knex } from 'knex';
import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';

/** A khata (credit) account for one (store, customer) pair. */
async function findAccount(storeId: string, customerUserId: string, trx?: Knex.Transaction) {
  const q = (trx ?? db)('khata_accounts').where({ store_id: storeId, customer_user_id: customerUserId }).first();
  return q;
}

/**
 * Charge an order to the customer's khata for a store (inside a transaction).
 * Throws if the shop hasn't opened a khata for them, or the limit is exceeded.
 */
export async function chargeToKhata(
  trx: Knex.Transaction,
  args: { storeId: string; customerUserId: string; orderId: string; amount: number; note?: string }
) {
  const acc = await trx('khata_accounts')
    .where({ store_id: args.storeId, customer_user_id: args.customerUserId, is_active: true })
    .first();
  if (!acc) throw new ApiError(403, 'khata.not_allowed');

  const newBalance = Math.round((Number(acc.balance) + args.amount) * 100) / 100;
  if (newBalance > Number(acc.credit_limit)) throw new ApiError(409, 'khata.limit_exceeded');

  await trx('khata_accounts').where({ id: acc.id }).update({ balance: newBalance, updated_at: trx.fn.now() });
  await trx('khata_entries').insert({
    khata_account_id: acc.id,
    order_id: args.orderId,
    type: 'debit',
    amount: args.amount,
    note: args.note ?? null,
    created_by: args.customerUserId,
  });
  return { balance: newBalance, credit_limit: Number(acc.credit_limit) };
}

/** Customer view: their khata across all shops + recent ledger entries. */
export async function listForCustomer(customerUserId: string) {
  const accounts = await db('khata_accounts as k')
    .join('stores as s', 's.id', 'k.store_id')
    .where('k.customer_user_id', customerUserId)
    .select('k.*', 's.name as store_name');

  const ids = accounts.map((a) => a.id);
  const entries = ids.length
    ? await db('khata_entries').whereIn('khata_account_id', ids).orderBy('created_at', 'desc').limit(100)
    : [];

  return accounts.map((a) => ({
    id: a.id,
    store_id: a.store_id,
    store_name: a.store_name,
    credit_limit: Number(a.credit_limit),
    balance: Number(a.balance),
    available: Math.max(0, Number(a.credit_limit) - Number(a.balance)),
    is_active: a.is_active,
    entries: entries
      .filter((e) => e.khata_account_id === a.id)
      .map((e) => ({
        id: e.id,
        type: e.type,
        amount: Number(e.amount),
        note: e.note,
        order_id: e.order_id,
        created_at: e.created_at,
      })),
  }));
}

/** Vendor view: every customer with a khata at this store. */
export async function listForStore(storeId: string) {
  const accounts = await db('khata_accounts as k')
    .join('users as u', 'u.id', 'k.customer_user_id')
    .where('k.store_id', storeId)
    .orderBy('k.balance', 'desc')
    .select('k.*', 'u.name as customer_name', 'u.phone as customer_phone');

  return accounts.map((a) => ({
    id: a.id,
    customer_user_id: a.customer_user_id,
    customer_name: a.customer_name,
    customer_phone: a.customer_phone,
    credit_limit: Number(a.credit_limit),
    balance: Number(a.balance),
    available: Math.max(0, Number(a.credit_limit) - Number(a.balance)),
    is_active: a.is_active,
  }));
}

/** Vendor sets/updates a customer's credit limit (creating the account if new). */
export async function upsertLimit(
  storeId: string,
  input: { phone?: string; customer_user_id?: string; credit_limit: number; is_active?: boolean }
) {
  let customerId = input.customer_user_id;
  if (!customerId && input.phone) {
    const u = await db('users').where({ phone: input.phone, role: 'customer' }).first();
    if (!u) throw new ApiError(404, 'khata.customer_not_found');
    customerId = u.id;
  }
  if (!customerId) throw new ApiError(400, 'common.validation_failed');

  const existing = await findAccount(storeId, customerId);
  if (existing) {
    await db('khata_accounts').where({ id: existing.id }).update({
      credit_limit: input.credit_limit,
      is_active: input.is_active ?? existing.is_active,
      updated_at: db.fn.now(),
    });
  } else {
    await db('khata_accounts').insert({
      store_id: storeId,
      customer_user_id: customerId,
      credit_limit: input.credit_limit,
      balance: 0,
      is_active: input.is_active ?? true,
    });
  }
  return listForStore(storeId);
}

/** Vendor/delivery records a repayment (cash received) → balance goes down. */
export async function recordPayment(
  storeId: string,
  input: { customer_user_id: string; amount: number; note?: string },
  actorId: string
) {
  const acc = await findAccount(storeId, input.customer_user_id);
  if (!acc) throw new ApiError(404, 'khata.no_account');

  const newBalance = Math.max(0, Math.round((Number(acc.balance) - input.amount) * 100) / 100);
  await db.transaction(async (trx) => {
    await trx('khata_accounts').where({ id: acc.id }).update({ balance: newBalance, updated_at: trx.fn.now() });
    await trx('khata_entries').insert({
      khata_account_id: acc.id,
      type: 'credit',
      amount: input.amount,
      note: input.note ?? null,
      created_by: actorId,
    });
  });
  return listForStore(storeId);
}
