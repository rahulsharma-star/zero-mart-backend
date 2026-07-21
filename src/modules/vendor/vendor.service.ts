import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { applyTransition } from '../orders/order-state';
import { enqueue } from '../notifications/notifications.service';
import { isActive as isSubscriptionActive } from '../subscriptions/subscriptions.service';

/** Block shop-operating actions when the subscription has lapsed. */
async function assertSubscribed(storeId: string) {
  if (!(await isSubscriptionActive(storeId))) throw new ApiError(403, 'subscription.inactive');
}

/** Store owned by this vendor user. */
export async function getVendorStore(userId: string) {
  const store = await db('stores').where({ owner_user_id: userId, is_active: true }).first();
  if (!store) throw new ApiError(404, 'vendor.no_store');
  return store;
}

/** Vendor updates their shop branding (name + logo). */
export async function updateShop(userId: string, input: { name?: string; logo_url?: string | null }) {
  const store = await getVendorStore(userId);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim();
  if (input.logo_url !== undefined) patch.logo_url = input.logo_url || null;
  if (Object.keys(patch).length) await db('stores').where({ id: store.id }).update(patch);
  const updated = await db('stores').where({ id: store.id }).first();
  return { id: updated.id, name: updated.name, logo_url: updated.logo_url ?? null, shop_code: updated.shop_code };
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

/** The vendor's own shop categories (they organise their products with these). */
export async function listCategories(userId: string) {
  const store = await getVendorStore(userId);
  return db('categories').where({ store_id: store.id }).orderBy('sort_order', 'asc');
}

export async function createCategory(
  userId: string,
  input: { name: any; image_url?: string; sort_order?: number; is_active?: boolean }
) {
  const store = await getVendorStore(userId);
  const [row] = await db('categories')
    .insert({
      store_id: store.id,
      name: JSON.stringify(input.name),
      slug: slugify(input.name?.en || input.name?.hi || input.name?.mr || 'category'),
      image_url: input.image_url ?? null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
      featured: false,
      feature_status: 'none',
    })
    .returning('*');
  return row;
}

async function assertOwnCategory(userId: string, id: string) {
  const store = await getVendorStore(userId);
  const cat = await db('categories').where({ id, store_id: store.id }).first();
  if (!cat) throw ApiError.notFound();
  return { store, cat };
}

export async function updateCategory(
  userId: string,
  id: string,
  input: Partial<{ name: any; image_url: string; sort_order: number; is_active: boolean }>
) {
  await assertOwnCategory(userId, id);
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = JSON.stringify(input.name);
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  const [row] = await db('categories').where({ id }).update(patch).returning('*');
  return row;
}

export async function deleteCategory(userId: string, id: string) {
  const { store } = await assertOwnCategory(userId, id);
  await db('products').where({ category_id: id, store_id: store.id }).update({ category_id: null });
  await db('categories').where({ id }).del();
}

/** Vendor asks admin to feature this category on the home screen. */
export async function requestCategoryFeature(userId: string, id: string) {
  await assertOwnCategory(userId, id);
  const [row] = await db('categories').where({ id }).update({ feature_status: 'requested' }).returning('*');
  return row;
}

/** Products of the vendor's own shop (raw rows for editing). */
export async function listProducts(userId: string) {
  const store = await getVendorStore(userId);
  return db('products').where({ store_id: store.id }).orderBy('sort_order', 'asc');
}

export async function createProduct(userId: string, input: any) {
  const store = await getVendorStore(userId);
  await assertSubscribed(store.id);
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
      attributes: JSON.stringify(input.attributes ?? {}),
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
  if (input.attributes !== undefined) patch.attributes = JSON.stringify(input.attributes);
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

// ── Vendor scrolling notices (website sidebar) ───────────
export async function listNotices(userId: string) {
  const store = await getVendorStore(userId);
  return db('vendor_notices').where({ store_id: store.id }).orderBy('created_at', 'desc');
}

export async function createNotice(
  userId: string,
  input: { message: { en?: string; hi?: string; mr?: string }; is_active?: boolean }
) {
  const store = await getVendorStore(userId);
  const msg = input.message || {};
  if (!msg.en?.trim() && !msg.hi?.trim() && !msg.mr?.trim()) {
    throw new ApiError(400, 'notice.text_required');
  }
  const [row] = await db('vendor_notices')
    .insert({
      store_id: store.id,
      message: JSON.stringify(msg),
      is_active: input.is_active ?? true,
    })
    .returning('*');
  return row;
}

export async function updateNotice(
  userId: string,
  id: string,
  input: { message?: { en?: string; hi?: string; mr?: string }; is_active?: boolean }
) {
  const store = await getVendorStore(userId);
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (input.message) patch.message = JSON.stringify(input.message);
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  const [row] = await db('vendor_notices').where({ id, store_id: store.id }).update(patch).returning('*');
  if (!row) throw new ApiError(404, 'common.not_found');
  return row;
}

export async function deleteNotice(userId: string, id: string) {
  const store = await getVendorStore(userId);
  const n = await db('vendor_notices').where({ id, store_id: store.id }).del();
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

  const paidQ = db('orders').where({ store_id: store.id, payment_status: 'paid' });
  const totalSales = (await paidQ.clone().sum<{ sum: string }[]>('total as sum'))[0];
  const yourPayout = (await paidQ.clone().sum<{ sum: string }[]>('vendor_payout as sum'))[0];
  const platformFee = (await paidQ.clone().sum<{ sum: string }[]>('platform_commission as sum'))[0];
  const [deliveredCount] = await db('orders')
    .where({ store_id: store.id, status: 'delivered' })
    .count<{ count: string }[]>('id as count');

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthPayout = (
    await db('orders')
      .where({ store_id: store.id, payment_status: 'paid' })
      .where('created_at', '>=', monthStart)
      .sum<{ sum: string }[]>('vendor_payout as sum')
  )[0];

  return {
    store: { id: store.id, name: store.name, logo_url: store.logo_url ?? null, phone: store.phone, shop_code: store.shop_code, commission_rate: store.commission_rate },
    user: { id: user.id, name: user.name, phone: user.phone },
    stats: {
      pending_orders: Number(pending.count),
      active_orders: Number(active.count),
      delivered_orders: Number(deliveredCount.count),
    },
    earnings: {
      total_sales: Number(totalSales?.sum ?? 0),
      your_payout: Number(yourPayout?.sum ?? 0),
      platform_commission: Number(platformFee?.sum ?? 0),
      payout_this_month: Number(monthPayout?.sum ?? 0),
    },
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
  await assertSubscribed(store.id);
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

// ── Delivery boys (vendor manages own riders) ────────────

export async function listDeliveryBoys(userId: string) {
  const store = await getVendorStore(userId);
  return db('delivery_boys as d')
    .join('users as u', 'u.id', 'd.user_id')
    .where('d.store_id', store.id)
    .select(
      'u.id',
      'u.name',
      'u.phone',
      'd.availability',
      'd.vehicle_type',
      'd.vehicle_number',
      'd.is_active',
      'd.total_deliveries',
      'd.rating_avg'
    )
    .orderBy('u.name', 'asc');
}

async function assertOwnDeliveryBoy(userId: string, boyUserId: string) {
  const store = await getVendorStore(userId);
  const boy = await db('delivery_boys').where({ user_id: boyUserId, store_id: store.id }).first();
  if (!boy) throw ApiError.notFound();
  return { store, boy };
}

/** Vendor adds a delivery boy linked to their shop. */
export async function createDeliveryBoy(
  userId: string,
  input: { name: string; phone: string; vehicle_type?: string; vehicle_number?: string }
) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const existing = await trx('users').where({ phone: input.phone }).first();
    let boyUserId: string;

    if (existing) {
      if (!['customer', 'delivery_boy'].includes(existing.role)) {
        throw new ApiError(409, 'common.validation_failed');
      }
      if (existing.role === 'delivery_boy') {
        const profile = await trx('delivery_boys').where({ user_id: existing.id }).first();
        if (profile?.store_id && profile.store_id !== store.id) {
          throw new ApiError(409, 'vendor.boy_other_shop');
        }
      }
      await trx('users')
        .where({ id: existing.id })
        .update({ role: 'delivery_boy', name: input.name, region_id: store.region_id });
      boyUserId = existing.id;

      const profile = await trx('delivery_boys').where({ user_id: boyUserId }).first();
      if (profile) {
        await trx('delivery_boys').where({ user_id: boyUserId }).update({
          store_id: store.id,
          region_id: store.region_id,
          vehicle_type: input.vehicle_type ?? profile.vehicle_type,
          vehicle_number: input.vehicle_number ?? profile.vehicle_number,
          is_active: true,
          updated_at: trx.fn.now(),
        });
      } else {
        await trx('delivery_boys').insert({
          user_id: boyUserId,
          region_id: store.region_id,
          store_id: store.id,
          vehicle_type: input.vehicle_type ?? null,
          vehicle_number: input.vehicle_number ?? null,
          availability: 'offline',
          is_active: true,
        });
      }
    } else {
      const [user] = await trx('users')
        .insert({
          phone: input.phone,
          name: input.name,
          role: 'delivery_boy',
          region_id: store.region_id,
          language: 'hi',
        })
        .returning('id');
      boyUserId = user.id;
      await trx('delivery_boys').insert({
        user_id: boyUserId,
        region_id: store.region_id,
        store_id: store.id,
        vehicle_type: input.vehicle_type ?? null,
        vehicle_number: input.vehicle_number ?? null,
        availability: 'offline',
        is_active: true,
      });
    }

    const row = await trx('delivery_boys as d')
      .join('users as u', 'u.id', 'd.user_id')
      .where('d.user_id', boyUserId)
      .select('u.id', 'u.name', 'u.phone', 'd.availability', 'd.vehicle_type', 'd.vehicle_number', 'd.is_active')
      .first();
    return row;
  });
}

export async function updateDeliveryBoy(
  userId: string,
  boyUserId: string,
  input: { name?: string; vehicle_type?: string; vehicle_number?: string; is_active?: boolean }
) {
  await assertOwnDeliveryBoy(userId, boyUserId);
  const patch: Record<string, unknown> = {};
  for (const k of ['vehicle_type', 'vehicle_number', 'is_active'] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (Object.keys(patch).length) {
    await db('delivery_boys').where({ user_id: boyUserId }).update({ ...patch, updated_at: db.fn.now() });
  }
  if (input.name) await db('users').where({ id: boyUserId }).update({ name: input.name });
  return db('delivery_boys as d')
    .join('users as u', 'u.id', 'd.user_id')
    .where('d.user_id', boyUserId)
    .select('u.id', 'u.name', 'u.phone', 'd.availability', 'd.vehicle_type', 'd.vehicle_number', 'd.is_active')
    .first();
}

/** Assign one of this vendor's delivery boys when order is ready_for_pickup. */
export async function assignDeliveryBoy(userId: string, orderId: string, deliveryBoyId?: string) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, store_id: store.id }).forUpdate().first();
    if (!order) throw ApiError.notFound();
    if (order.status !== 'ready_for_pickup') throw new ApiError(409, 'order.invalid_transition');

    let boyId = deliveryBoyId;
    if (!boyId) {
      const top = await trx('delivery_boys')
        .where({ store_id: store.id, is_active: true })
        .orderByRaw("CASE WHEN availability = 'online' THEN 0 ELSE 1 END")
        .orderBy('total_deliveries', 'asc')
        .first();
      if (!top) throw new ApiError(409, 'vendor.no_delivery_boy');
      boyId = top.user_id;
    } else {
      const boy = await trx('delivery_boys')
        .where({ user_id: boyId, store_id: store.id, is_active: true })
        .first();
      if (!boy) throw ApiError.notFound();
    }

    const finalBoyId = boyId as string;
    await applyTransition(trx, orderId, 'assigned', { actorId: userId, reason: 'vendor_assign' });
    await trx('delivery_assignments').insert({ order_id: orderId, delivery_boy_id: finalBoyId, status: 'offered' });
    await enqueue(trx, {
      userId: finalBoyId,
      event: 'delivery_assigned_boy',
      vars: { order: order.order_number },
    });
    return { ok: true, delivery_boy_id: finalBoyId };
  });
}

/** Re-offer order to another boy if current assignment is stuck. */
export async function unassignDeliveryBoy(userId: string, orderId: string) {
  const store = await getVendorStore(userId);
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, store_id: store.id }).forUpdate().first();
    if (!order) throw ApiError.notFound();
    if (order.status !== 'assigned') throw new ApiError(409, 'order.invalid_transition');

    const active = await trx('delivery_assignments')
      .where({ order_id: orderId })
      .whereIn('status', ['offered', 'accepted']);
    await trx('delivery_assignments')
      .where({ order_id: orderId })
      .whereIn('status', ['offered', 'accepted'])
      .update({ status: 'expired', responded_at: trx.fn.now() });
    for (const a of active.filter((x) => x.status === 'accepted')) {
      await trx('delivery_boys')
        .where({ user_id: a.delivery_boy_id, availability: 'busy' })
        .update({ availability: 'online', updated_at: trx.fn.now() });
    }
    await applyTransition(trx, orderId, 'ready_for_pickup', { actorId: userId, reason: 'vendor_repool' });
    return { ok: true };
  });
}
