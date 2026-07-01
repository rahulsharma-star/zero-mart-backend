import { db } from '../../config/db';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { signToken } from '../../utils/jwt';
import { generateShopCode } from '../../utils/shopCode';
import { buildPaymentRequest, payuActionUrl, PayuRequestParams } from '../../services/payu';

/** Free trial length for a newly registered shop. */
const TRIAL_DAYS = 15;

function genTxnId(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SUB${Date.now().toString(36).toUpperCase()}${rand}`.slice(0, 40);
}

export function serializeSub(s: any) {
  if (!s) return null;
  const expired = s.expires_at && new Date(s.expires_at).getTime() < Date.now();
  const status = expired && (s.status === 'trial' || s.status === 'active') ? 'expired' : s.status;
  return {
    id: s.id,
    plan_id: s.plan_id ?? null,
    status,
    started_at: s.started_at ?? null,
    expires_at: s.expires_at ?? null,
  };
}

export async function getStoreSubscription(storeId: string) {
  const s = await db('vendor_subscriptions').where({ store_id: storeId }).orderBy('created_at', 'desc').first();
  return serializeSub(s);
}

/** True when the shop can operate (trial or active, not expired). */
export async function isActive(storeId: string): Promise<boolean> {
  const s = await db('vendor_subscriptions')
    .where({ store_id: storeId })
    .whereIn('status', ['trial', 'active'])
    .orderBy('created_at', 'desc')
    .first();
  if (!s) return false;
  if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function mySubscription(userId: string) {
  const store = await db('stores').where({ owner_user_id: userId }).first();
  if (!store) throw ApiError.notFound();
  return getStoreSubscription(store.id);
}

/** Active plans a vendor can choose from. */
export async function listPlans() {
  return db('subscription_plans').where({ is_active: true }).orderBy('sort_order', 'asc');
}

/** Self-serve shop registration: creates the shop, upgrades the user to vendor,
 *  starts a free trial, and returns a fresh vendor token. */
export async function registerVendor(
  userId: string,
  input: { shop_name: string; address?: string; pincode?: string }
) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw ApiError.notFound();

  const existingStore = await db('stores').where({ owner_user_id: userId }).first();
  if (existingStore) throw new ApiError(409, 'subscription.already_vendor');

  let regionId: string | null = null;
  if (input.pincode) {
    const area = await db('service_areas').where({ pincode: input.pincode, is_active: true }).first();
    regionId = area?.region_id ?? null;
  }
  if (!regionId) {
    const anyRegion = await db('regions').first();
    regionId = anyRegion?.id ?? null;
  }
  if (!regionId) throw new ApiError(422, 'subscription.no_region');

  const result = await db.transaction(async (trx) => {
    const shopCode = await generateShopCode(trx, input.shop_name);
    const [store] = await trx('stores')
      .insert({
        region_id: regionId,
        name: input.shop_name,
        shop_code: shopCode,
        address: input.address ?? null,
        phone: user.phone,
        owner_user_id: userId,
        commission_rate: null, // default: no commission (admin can set later)
        is_active: true,
      })
      .returning('*');

    await trx('users').where({ id: userId }).update({ role: 'vendor', region_id: regionId });

    const now = new Date();
    const expires = new Date(now.getTime() + TRIAL_DAYS * 86400 * 1000);
    const [sub] = await trx('vendor_subscriptions')
      .insert({ store_id: store.id, plan_id: null, status: 'trial', started_at: now, expires_at: expires })
      .returning('*');

    return { store, sub };
  });

  const token = signToken({ sub: userId, role: 'vendor', phone: user.phone });
  return {
    token,
    store: { id: result.store.id, name: result.store.name, shop_code: result.store.shop_code },
    subscription: serializeSub(result.sub),
  };
}

/** Vendor picks a plan → pay via PayU (or dev-bypass activates immediately). */
export async function subscribe(userId: string, planId: string) {
  const store = await db('stores').where({ owner_user_id: userId }).first();
  if (!store) throw ApiError.notFound();
  const plan = await db('subscription_plans').where({ id: planId, is_active: true }).first();
  if (!plan) throw new ApiError(404, 'subscription.plan_not_found');
  const user = await db('users').where({ id: userId }).first();

  const [sub] = await db('vendor_subscriptions')
    .insert({ store_id: store.id, plan_id: plan.id, status: 'pending' })
    .returning('*');

  const txnid = genTxnId();

  if (env.payu.devBypass) {
    await activateSubscription(sub.id);
    await db('payments').insert({
      subscription_id: sub.id, order_id: null, gateway: 'dev-bypass', txnid,
      method: 'subscription', amount: plan.price, status: 'success',
      raw_response: JSON.stringify({ bypass: true }),
    });
    return { bypass: true, subscriptionId: sub.id };
  }

  await db('payments').insert({
    subscription_id: sub.id, order_id: null, gateway: 'payu', txnid,
    method: 'subscription', amount: plan.price, status: 'pending',
  });

  const params: PayuRequestParams = buildPaymentRequest({
    txnid,
    amount: Number(plan.price),
    productinfo: `Subscription ${plan.name}`,
    firstname: user?.name ?? 'Vendor',
    email: user?.email ?? 'vendor@zero.local',
    phone: user?.phone ?? '',
    udf1: sub.id,
  });
  return { action: payuActionUrl, params, mode: env.payu.mode };
}

/** Turn a subscription on and set its expiry from the plan duration. */
export async function activateSubscription(subscriptionId: string) {
  const sub = await db('vendor_subscriptions').where({ id: subscriptionId }).first();
  if (!sub) return;
  const plan = sub.plan_id ? await db('subscription_plans').where({ id: sub.plan_id }).first() : null;
  const days = plan?.duration_days ?? 30;
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86400 * 1000);
  await db('vendor_subscriptions').where({ id: subscriptionId }).update({
    status: 'active', started_at: now, expires_at: expires, updated_at: db.fn.now(),
  });
  // Any earlier subscription for this shop is superseded.
  await db('vendor_subscriptions')
    .where({ store_id: sub.store_id })
    .andWhereNot({ id: subscriptionId })
    .update({ status: 'expired', updated_at: db.fn.now() });
}

// ── Admin plan management ────────────────────────────────
export async function adminListPlans() {
  return db('subscription_plans').orderBy('sort_order', 'asc');
}
export async function createPlan(input: any) {
  const [row] = await db('subscription_plans')
    .insert({
      name: input.name,
      price: input.price,
      duration_days: input.duration_days,
      max_products: input.max_products ?? null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    })
    .returning('*');
  return row;
}
export async function updatePlan(id: string, input: any) {
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'price', 'duration_days', 'max_products', 'is_active', 'sort_order']) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const [row] = await db('subscription_plans').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  return row;
}
export async function deletePlan(id: string) {
  const n = await db('subscription_plans').where({ id }).del();
  if (!n) throw ApiError.notFound();
}
