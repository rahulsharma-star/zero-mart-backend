import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { applyTransition } from '../orders/order-state';
import { enqueue } from '../notifications/notifications.service';

/** Store owned by this vendor user. */
export async function getVendorStore(userId: string) {
  const store = await db('stores').where({ owner_user_id: userId, is_active: true }).first();
  if (!store) throw new ApiError(404, 'vendor.no_store');
  return store;
}

// ── Vendor products ──────────────────────────────────────
function slugify(s: string): string {
  return (
    String(s || 'item')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6)
  );
}

export async function listCategories() {
  return db('categories').where({ is_active: true }).orderBy('sort_order', 'asc');
}

/** Products of the vendor's own shop (raw rows for editing). */
export async function listProducts(userId: string) {
  const store = await getVendorStore(userId);
  return db('products').where({ store_id: store.id }).orderBy('sort_order', 'asc');
}

export async function createProduct(userId: string, input: any) {
  const store = await getVendorStore(userId);
  const [row] = await db('products')
    .insert({
      store_id: store.id,
      category_id: input.category_id ?? null,
      name: JSON.stringify(input.name),
      description: input.description ? JSON.stringify(input.description) : null,
      slug: slugify(input.name?.en || input.name?.hi || 'item'),
      unit: input.unit ?? null,
      price: input.price,
      extra_charge: input.extra_charge ?? 0,
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

/** Ensure a product belongs to this vendor's shop before editing. */
async function assertOwnProduct(userId: string, productId: string) {
  const store = await getVendorStore(userId);
  const product = await db('products').where({ id: productId, store_id: store.id }).first();
  if (!product) throw new ApiError(404, 'common.not_found');
  return product;
}

export async function updateProduct(userId: string, id: string, input: any) {
  await assertOwnProduct(userId, id);
  const patch: Record<string, unknown> = {};
  if (input.category_id !== undefined) patch.category_id = input.category_id;
  if (input.name) patch.name = JSON.stringify(input.name);
  if (input.description !== undefined) patch.description = input.description ? JSON.stringify(input.description) : null;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.price !== undefined) patch.price = input.price;
  if (input.extra_charge !== undefined) patch.extra_charge = input.extra_charge;
  if (input.mrp !== undefined) patch.mrp = input.mrp;
  if (input.stock !== undefined) patch.stock = input.stock;
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.images !== undefined) patch.images = JSON.stringify(input.images);
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  const [row] = await db('products').where({ id }).update(patch).returning('*');
  return row;
}

export async function deleteProduct(userId: string, id: string) {
  await assertOwnProduct(userId, id);
  await db('products').where({ id }).del();
}

// ── Vendor banners / ads ─────────────────────────────────
/** List all banners this vendor created (any status). */
export async function listBanners(userId: string) {
  const store = await getVendorStore(userId);
  return db('banners').where({ store_id: store.id }).orderBy('created_at', 'desc');
}

/**
 * Create a banner. placement 'shop' → auto-approved (vendor's own page).
 * placement 'home' → 'pending' (admin approval + charge required for home).
 */
export async function createBanner(
  userId: string,
  input: {
    image_url: string;
    title?: { en?: string; hi?: string; mr?: string };
    placement?: 'shop' | 'home';
    action_type?: string;
    action_value?: string;
  }
) {
  const store = await getVendorStore(userId);
  const placement = input.placement === 'home' ? 'home' : 'shop';
  const [row] = await db('banners')
    .insert({
      title: input.title ? JSON.stringify(input.title) : null,
      image_url: input.image_url,
      action_type: input.action_type ?? 'none',
      action_value: input.action_value ?? null,
      screen: placement === 'home' ? 'home' : 'shop',
      position: 'top',
      owner_user_id: userId,
      store_id: store.id,
      placement,
      status: placement === 'home' ? 'pending' : 'approved',
      is_active: true,
    })
    .returning('*');
  return row;
}

export async function deleteBanner(userId: string, id: string) {
  const store = await getVendorStore(userId);
  const n = await db('banners').where({ id, store_id: store.id }).del();
  if (!n) throw new ApiError(404, 'common.not_found');
}

export async function me(userId: string) {
  const store = await getVendorStore(userId);
  const user = await db('users').where({ id: userId }).first();
  const [pending] = await db('orders')
    .where({ store_id: store.id, status: 'placed' })
    .count<{ count: string }[]>('id as count');
  const [active] = await db('orders')
    .where({ store_id: store.id })
    .whereIn('status', ['confirmed', 'preparing', 'ready_for_pickup'])
    .count<{ count: string }[]>('id as count');
  return {
    store: { id: store.id, name: store.name, phone: store.phone, commission_rate: store.commission_rate },
    user: { id: user.id, name: user.name, phone: user.phone },
    stats: { pending_orders: Number(pending.count), active_orders: Number(active.count) },
  };
}

export async function listOrders(userId: string, filter?: string) {
  const store = await getVendorStore(userId);
  const q = db('orders as o')
    .join('users as u', 'u.id', 'o.user_id')
    .where('o.store_id', store.id)
    .select(
      'o.id',
      'o.order_number',
      'o.status',
      'o.payment_method',
      'o.payment_status',
      'o.total',
      'o.subtotal',
      'o.platform_commission',
      'o.vendor_payout',
      'o.created_at',
      'o.address_line1',
      'o.address_pincode',
      'o.contact_name',
      'o.contact_phone',
      'u.name as customer_name',
      'u.phone as customer_phone'
    )
    .orderBy('o.created_at', 'desc');

  if (filter === 'pending') q.where('o.status', 'placed');
  else if (filter === 'active') q.whereIn('o.status', ['confirmed', 'preparing', 'ready_for_pickup', 'assigned', 'picked_up', 'out_for_delivery']);
  else if (filter === 'completed') q.whereIn('o.status', ['delivered', 'cancelled']);

  return q.limit(50);
}

export async function getOrder(userId: string, orderId: string) {
  const store = await getVendorStore(userId);
  const order = await db('orders').where({ id: orderId, store_id: store.id }).first();
  if (!order) throw ApiError.notFound();
  const items = await db('order_items').where({ order_id: orderId });
  const customer = await db('users').where({ id: order.user_id }).first();
  return { ...order, items, customer: customer ? { name: customer.name, phone: customer.phone } : null };
}

export async function acceptOrder(userId: string, orderId: string) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, store_id: store.id }).forUpdate().first();
    if (!order) throw ApiError.notFound();
    if (order.status !== 'placed') throw new ApiError(409, 'order.invalid_transition');
    await applyTransition(trx, orderId, 'confirmed', { actorId: userId, reason: 'vendor_accept' });
    await enqueue(trx, { userId: order.user_id, event: 'confirmed', vars: { order: order.order_number } });
    return trx('orders').where({ id: orderId }).first();
  });
}

export async function rejectOrder(userId: string, orderId: string, reason?: string) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, store_id: store.id }).forUpdate().first();
    if (!order) throw ApiError.notFound();
    if (order.status !== 'placed') throw new ApiError(409, 'order.invalid_transition');
    await applyTransition(trx, orderId, 'cancelled', { actorId: userId, reason: reason ?? 'vendor_reject' });
    // restore stock
    const items = await trx('order_items').where({ order_id: orderId });
    for (const it of items) {
      if (it.product_id) await trx('products').where({ id: it.product_id }).increment('stock', it.quantity);
    }
    await enqueue(trx, { userId: order.user_id, event: 'cancelled', vars: { order: order.order_number } });
    return { ok: true };
  });
}

export async function updateStatus(userId: string, orderId: string, status: string) {
  const store = await getVendorStore(userId);
  const allowed = ['preparing', 'ready_for_pickup'];
  if (!allowed.includes(status)) throw ApiError.badRequest();
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, store_id: store.id }).first();
    if (!order) throw ApiError.notFound();
    await applyTransition(trx, orderId, status as any, { actorId: userId });
    return trx('orders').where({ id: orderId }).first();
  });
}

// ── Broadcast offers (open requests) ─────────────────────

export async function listOffers(userId: string) {
  const store = await getVendorStore(userId);
  return db('store_order_offers as so')
    .join('open_requests as r', 'r.id', 'so.open_request_id')
    .join('users as u', 'u.id', 'r.user_id')
    .where('so.store_id', store.id)
    .where('so.status', 'offered')
    .where('r.status', 'pending')
    .select(
      'so.id as offer_id',
      'r.id as request_id',
      'r.request_text',
      'r.pincode',
      'r.created_at',
      'u.name as customer_name',
      'u.phone as customer_phone'
    )
    .orderBy('so.offered_at', 'desc');
}

export async function acceptOffer(userId: string, offerId: string, quotedPrice?: number) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const offer = await trx('store_order_offers')
      .where({ id: offerId, store_id: store.id, status: 'offered' })
      .forUpdate()
      .first();
    if (!offer) throw ApiError.notFound();

    const request = await trx('open_requests').where({ id: offer.open_request_id }).forUpdate().first();
    if (!request || request.status !== 'pending') throw new ApiError(409, 'request.already_matched');

    // first accept wins
    await trx('store_order_offers').where({ id: offerId }).update({
      status: 'accepted',
      quoted_price: quotedPrice ?? null,
      responded_at: trx.fn.now(),
    });
    await trx('store_order_offers')
      .where({ open_request_id: offer.open_request_id, status: 'offered' })
      .whereNot('id', offerId)
      .update({ status: 'expired', responded_at: trx.fn.now() });

    await trx('open_requests').where({ id: request.id }).update({
      status: 'matched',
      matched_store_id: store.id,
      quoted_price: quotedPrice ?? null,
      updated_at: trx.fn.now(),
    });

    await enqueue(trx, {
      userId: request.user_id,
      event: 'request_matched',
      vars: { shop: store.name },
    });

    return { ok: true, request_id: request.id, store_name: store.name, quoted_price: quotedPrice ?? null };
  });
}

export async function rejectOffer(userId: string, offerId: string, reason?: string) {
  const store = await getVendorStore(userId);
  const n = await db('store_order_offers')
    .where({ id: offerId, store_id: store.id, status: 'offered' })
    .update({ status: 'rejected', reject_reason: reason ?? null, responded_at: db.fn.now() });
  if (!n) throw ApiError.notFound();
  return { ok: true };
}
