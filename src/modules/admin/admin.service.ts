import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { applyTransition, ORDER_STATUSES } from '../orders/order-state';
import { enqueue } from '../notifications/notifications.service';

/** Multilingual text field { en, hi }. */
type Ml = { en: string; hi?: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

// ── Dashboard ────────────────────────────────────────────
export async function dashboard() {
  const [orders] = await db('orders').count<{ count: string }[]>('id as count');
  const [users] = await db('users').where({ role: 'customer' }).count<{ count: string }[]>('id as count');
  const [products] = await db('products').count<{ count: string }[]>('id as count');
  const revenueRow = await db('orders').where({ payment_status: 'paid' }).sum<{ sum: string }[]>('total as sum');
  const byStatus = await db('orders').select('status').count('id as count').groupBy('status');
  const recent = await db('orders').orderBy('created_at', 'desc').limit(10);

  return {
    totals: {
      orders: Number(orders.count),
      customers: Number(users.count),
      products: Number(products.count),
      revenue: Number(revenueRow[0]?.sum ?? 0),
    },
    orders_by_status: byStatus.map((r: any) => ({ status: r.status, count: Number(r.count) })),
    recent_orders: recent,
  };
}

// ── Categories ───────────────────────────────────────────
export async function listCategories() {
  return db('categories').orderBy('sort_order', 'asc');
}
export async function createCategory(input: { name: Ml; image_url?: string; sort_order?: number; is_active?: boolean }) {
  const [row] = await db('categories')
    .insert({
      name: JSON.stringify(input.name),
      slug: slugify(input.name.en),
      image_url: input.image_url ?? null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .returning('*');
  return row;
}
export async function updateCategory(id: string, input: Partial<{ name: Ml; image_url: string; sort_order: number; is_active: boolean }>) {
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = JSON.stringify(input.name);
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  const [row] = await db('categories').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  return row;
}
export async function deleteCategory(id: string) {
  const n = await db('categories').where({ id }).del();
  if (!n) throw ApiError.notFound();
}

// ── Products ─────────────────────────────────────────────
export async function listProducts(opts: { page: number; limit: number; search?: string }) {
  const q = db('products');
  if (opts.search) {
    q.whereRaw(`(name->>'en' ILIKE ? OR name->>'hi' ILIKE ?)`, [`%${opts.search}%`, `%${opts.search}%`]);
  }
  const [{ count }] = await q.clone().count<{ count: string }[]>('id as count');
  const items = await q
    .clone()
    .orderBy('sort_order', 'asc')
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  return { items, total: Number(count), page: opts.page, limit: opts.limit };
}
export async function createProduct(input: any) {
  const [row] = await db('products')
    .insert({
      category_id: input.category_id ?? null,
      name: JSON.stringify(input.name),
      description: input.description ? JSON.stringify(input.description) : null,
      slug: slugify(input.name.en) + '-' + Math.random().toString(36).slice(2, 6),
      unit: input.unit ?? null,
      price: input.price,
      mrp: input.mrp ?? null,
      stock: input.stock ?? 0,
      image_url: input.image_url ?? null,
      images: JSON.stringify(input.images ?? []),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    })
    .returning('*');
  return row;
}
export async function updateProduct(id: string, input: any) {
  const patch: Record<string, unknown> = {};
  if (input.category_id !== undefined) patch.category_id = input.category_id;
  if (input.name) patch.name = JSON.stringify(input.name);
  if (input.description !== undefined) patch.description = input.description ? JSON.stringify(input.description) : null;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.price !== undefined) patch.price = input.price;
  if (input.mrp !== undefined) patch.mrp = input.mrp;
  if (input.stock !== undefined) patch.stock = input.stock;
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.images !== undefined) patch.images = JSON.stringify(input.images);
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  const [row] = await db('products').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  return row;
}
export async function deleteProduct(id: string) {
  const n = await db('products').where({ id }).del();
  if (!n) throw ApiError.notFound();
}

// ── Orders ───────────────────────────────────────────────
export async function listOrders(opts: { page: number; limit: number; status?: string }) {
  const q = db('orders');
  if (opts.status) q.where({ status: opts.status });
  const [{ count }] = await q.clone().count<{ count: string }[]>('id as count');
  const items = await q
    .clone()
    .orderBy('created_at', 'desc')
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);

  // Flag orders that were rejected/expired by a delivery boy and need reassignment.
  const ids = items.map((o) => o.id);
  const rejects = ids.length
    ? await db('delivery_assignments').whereIn('order_id', ids).whereIn('status', ['rejected', 'expired'])
    : [];
  const rejectCount = new Map<string, number>();
  for (const r of rejects) rejectCount.set(r.order_id, (rejectCount.get(r.order_id) ?? 0) + 1);

  const withFlags = items.map((o) => ({
    ...o,
    rejected_count: rejectCount.get(o.id) ?? 0,
    needs_reassign: o.status === 'ready_for_pickup' && (rejectCount.get(o.id) ?? 0) > 0,
  }));
  return { items: withFlags, total: Number(count), page: opts.page, limit: opts.limit };
}
export async function getOrder(id: string) {
  const order = await db('orders').where({ id }).first();
  if (!order) throw new ApiError(404, 'order.not_found');
  const items = await db('order_items').where({ order_id: id });
  const customer = await db('users').where({ id: order.user_id }).first();
  // assignment history (who was offered, accepted, rejected + reason)
  const assignments = await db('delivery_assignments as da')
    .join('users as u', 'u.id', 'da.delivery_boy_id')
    .where('da.order_id', id)
    .select('da.id', 'da.status', 'da.reject_reason', 'da.offered_at', 'da.responded_at', 'u.name as boy_name', 'u.phone as boy_phone')
    .orderBy('da.offered_at', 'desc');
  const history = await db('order_status_history').where({ order_id: id }).orderBy('created_at', 'asc');
  const needs_reassign = order.status === 'ready_for_pickup' && assignments.some((a) => ['rejected', 'expired'].includes(a.status));
  return {
    ...order,
    items,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    assignments,
    status_history: history,
    needs_reassign,
  };
}
export async function updateOrderStatus(id: string, status: string, actorId?: string) {
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw ApiError.badRequest();
  return db.transaction(async (trx) => {
    await applyTransition(trx, id, status as any, { actorId });
    const row = await trx('orders').where({ id }).first();
    // restore stock on admin cancellation
    if (status === 'cancelled') {
      const items = await trx('order_items').where({ order_id: id });
      for (const it of items) if (it.product_id) await trx('products').where({ id: it.product_id }).increment('stock', it.quantity);
    }
    return row;
  });
}

// ── Delivery boys ────────────────────────────────────────
export async function listDeliveryBoys(opts: { region_id?: string; availability?: string }) {
  const q = db('delivery_boys as d').join('users as u', 'u.id', 'd.user_id')
    .select('u.id', 'u.name', 'u.phone', 'u.is_active as user_active',
      'd.region_id', 'd.availability', 'd.vehicle_type', 'd.vehicle_number', 'd.is_active',
      'd.total_deliveries', 'd.rating_avg', 'd.payout_per_order');
  if (opts.region_id) q.where('d.region_id', opts.region_id);
  if (opts.availability) q.where('d.availability', opts.availability);
  return q.orderBy('u.name', 'asc');
}
export async function createDeliveryBoy(input: any) {
  return db.transaction(async (trx) => {
    const existing = await trx('users').where({ phone: input.phone }).first();
    if (existing) throw new ApiError(409, 'common.validation_failed');
    const [user] = await trx('users')
      .insert({ phone: input.phone, name: input.name, role: 'delivery_boy', region_id: input.region_id, language: input.language ?? 'hi' })
      .returning('*');
    await trx('delivery_boys').insert({
      user_id: user.id, region_id: input.region_id, store_id: input.store_id ?? null,
      vehicle_type: input.vehicle_type, vehicle_number: input.vehicle_number,
      payout_per_order: input.payout_per_order ?? null,
      availability: 'offline', is_active: true,
    });
    return { id: user.id, name: user.name, phone: user.phone };
  });
}
export async function updateDeliveryBoy(userId: string, input: any) {
  const patch: Record<string, unknown> = {};
  for (const k of ['region_id', 'store_id', 'vehicle_type', 'vehicle_number', 'is_active', 'availability', 'payout_per_order']) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const [row] = await db('delivery_boys').where({ user_id: userId }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  if (input.name) await db('users').where({ id: userId }).update({ name: input.name });
  return row;
}

/** Earnings ledger + payouts + due (payable) for a delivery boy. */
export async function deliveryBoyEarnings(userId: string) {
  const earnings = await db('delivery_earnings').where({ delivery_boy_id: userId }).orderBy('created_at', 'desc').limit(100);
  const payouts = await db('delivery_payouts').where({ delivery_boy_id: userId }).orderBy('created_at', 'desc').limit(100);
  const totalEarned = (await db('delivery_earnings').where({ delivery_boy_id: userId }).sum<{ sum: string }[]>('amount as sum'))[0];
  const totalPaidRow = (await db('delivery_payouts').where({ delivery_boy_id: userId }).sum<{ sum: string }[]>('amount as sum'))[0];
  const earned = Number(totalEarned?.sum ?? 0);
  const paid = Number(totalPaidRow?.sum ?? 0);
  return {
    total_earned: earned,
    total_paid: paid,
    due: Math.round((earned - paid) * 100) / 100,
    earnings,
    payouts,
  };
}

/** Record a manual (out-of-band) payout to a delivery boy. */
export async function recordPayout(userId: string, input: { amount: number; method?: string; note?: string }, actorId: string) {
  const boy = await db('delivery_boys').where({ user_id: userId }).first();
  if (!boy) throw ApiError.notFound();
  const [row] = await db('delivery_payouts')
    .insert({ delivery_boy_id: userId, amount: input.amount, method: input.method ?? 'cash', note: input.note ?? null, paid_by: actorId })
    .returning('*');
  return row;
}

// ── Assignment ───────────────────────────────────────────
export async function suggestDeliveryBoys(orderId: string) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new ApiError(404, 'order.not_found');
  return db('delivery_boys as d').join('users as u', 'u.id', 'd.user_id')
    .where({ 'd.region_id': order.region_id, 'd.availability': 'online', 'd.is_active': true })
    .select('u.id', 'u.name', 'u.phone', 'd.total_deliveries', 'd.rating_avg')
    .orderBy([{ column: 'd.total_deliveries', order: 'asc' }, { column: 'd.rating_avg', order: 'desc' }])
    .limit(10);
}
export async function assignOrder(orderId: string, deliveryBoyId: string | undefined, actorId: string) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new ApiError(404, 'order.not_found');

    let boyId = deliveryBoyId;
    if (!boyId) {
      const top = await trx('delivery_boys')
        .where({ region_id: order.region_id, availability: 'online', is_active: true })
        .orderBy('total_deliveries', 'asc').first();
      if (!top) throw new ApiError(409, 'common.validation_failed'); // no boy available
      boyId = top.user_id;
    } else {
      const boy = await trx('delivery_boys').where({ user_id: boyId, is_active: true }).first();
      if (!boy) throw ApiError.notFound();
    }

    const finalBoyId = boyId as string;
    // order must be ready_for_pickup → assigned
    await applyTransition(trx, orderId, 'assigned', { actorId, reason: 'admin_assign' });
    await trx('delivery_assignments').insert({ order_id: orderId, delivery_boy_id: finalBoyId, status: 'offered' });
    await enqueue(trx, { userId: finalBoyId, event: 'delivery_assigned_boy', vars: { order: order.order_number } });
    return { ok: true, delivery_boy_id: finalBoyId };
  });
}

/** Re-pool an order stuck at offered/assigned (boy ignored/unreachable): release assignment, back to ready_for_pickup. */
export async function unassignOrder(orderId: string, actorId: string) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new ApiError(404, 'order.not_found');
    if (order.status !== 'assigned') throw new ApiError(409, 'order.invalid_transition');
    // free any boy who had accepted (was set 'busy') before expiring the assignment
    const active = await trx('delivery_assignments').where({ order_id: orderId }).whereIn('status', ['offered', 'accepted']);
    await trx('delivery_assignments').where({ order_id: orderId }).whereIn('status', ['offered', 'accepted'])
      .update({ status: 'expired', responded_at: trx.fn.now() });
    for (const a of active.filter((x) => x.status === 'accepted')) {
      await trx('delivery_boys').where({ user_id: a.delivery_boy_id, availability: 'busy' })
        .update({ availability: 'online', updated_at: trx.fn.now() });
    }
    await applyTransition(trx, orderId, 'ready_for_pickup', { actorId, reason: 'admin_unassign' });
    return { ok: true };
  });
}

// ── Regions & pricing ────────────────────────────────────
export async function listRegions() {
  return db('regions').orderBy('created_at', 'asc');
}
export async function createRegion(input: any) {
  const [row] = await db('regions').insert({
    name: input.name, city: input.city, state: input.state, currency: input.currency ?? 'INR', is_active: input.is_active ?? true,
  }).returning('*');
  // create a default pricing row
  await db('region_pricing').insert({ region_id: row.id, base_delivery_fee: 20, min_order_value: 99, free_delivery_above: 299 });
  return row;
}
export async function updateRegion(id: string, input: any) {
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'city', 'state', 'currency', 'is_active']) if (input[k] !== undefined) patch[k] = input[k];
  const [row] = await db('regions').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  return row;
}
export async function listPincodes(regionId: string) {
  return db('service_areas').where({ region_id: regionId }).orderBy('pincode', 'asc');
}
export async function addPincode(regionId: string, input: any) {
  const [row] = await db('service_areas')
    .insert({ region_id: regionId, pincode: input.pincode, city: input.city, area_name: input.area_name, is_active: true })
    .onConflict('pincode').merge().returning('*');
  return row;
}
export async function removePincode(id: string) {
  const n = await db('service_areas').where({ id }).del();
  if (!n) throw ApiError.notFound();
}
export async function getRegionPricing(regionId: string) {
  return db('region_pricing').where({ region_id: regionId, is_active: true }).first();
}
export async function updateRegionPricing(regionId: string, input: any) {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const k of ['base_delivery_fee', 'min_order_value', 'free_delivery_above', 'surge_multiplier', 'surge_active', 'promo_discount', 'urgent_fee']) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const existing = await db('region_pricing').where({ region_id: regionId, is_active: true }).first();
  if (existing) {
    const [row] = await db('region_pricing').where({ id: existing.id }).update(patch).returning('*');
    return row;
  }
  const [row] = await db('region_pricing').insert({ region_id: regionId, ...patch }).returning('*');
  return row;
}

// ── Users ────────────────────────────────────────────────
export async function listUsers(opts: { page: number; limit: number; search?: string }) {
  const q = db('users');
  if (opts.search) q.where('phone', 'ILIKE', `%${opts.search}%`).orWhere('name', 'ILIKE', `%${opts.search}%`);
  const [{ count }] = await q.clone().count<{ count: string }[]>('id as count');
  const items = await q
    .clone()
    .select('id', 'phone', 'name', 'email', 'role', 'language', 'is_active', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  return { items, total: Number(count), page: opts.page, limit: opts.limit };
}

// ── Banners ──────────────────────────────────────────────
export async function listBanners() {
  return db('banners').orderBy('sort_order', 'asc');
}
export async function createBanner(input: any) {
  const [row] = await db('banners')
    .insert({
      title: input.title ? JSON.stringify(input.title) : null,
      image_url: input.image_url,
      action_type: input.action_type ?? 'none',
      action_value: input.action_value ?? null,
      screen: input.screen ?? 'home',
      position: input.position ?? 'top',
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .returning('*');
  return row;
}
export async function updateBanner(id: string, input: any) {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title ? JSON.stringify(input.title) : null;
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.action_type !== undefined) patch.action_type = input.action_type;
  if (input.action_value !== undefined) patch.action_value = input.action_value;
  if (input.screen !== undefined) patch.screen = input.screen;
  if (input.position !== undefined) patch.position = input.position;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  const [row] = await db('banners').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound();
  return row;
}
export async function deleteBanner(id: string) {
  const n = await db('banners').where({ id }).del();
  if (!n) throw ApiError.notFound();
}

// ── Service areas ────────────────────────────────────────
export async function listServiceAreas() {
  return db('service_areas').orderBy('pincode', 'asc');
}
export async function createServiceArea(input: { pincode: string; city?: string; area_name?: string; is_active?: boolean }) {
  const [row] = await db('service_areas')
    .insert({ pincode: input.pincode, city: input.city, area_name: input.area_name, is_active: input.is_active ?? true })
    .onConflict('pincode')
    .merge()
    .returning('*');
  return row;
}
export async function deleteServiceArea(id: string) {
  const n = await db('service_areas').where({ id }).del();
  if (!n) throw ApiError.notFound();
}
