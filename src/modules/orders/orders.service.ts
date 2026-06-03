import { db } from '../../config/db';
import { Lang, localizeField } from '../../i18n';
import { ApiError } from '../../utils/ApiError';
import { computeTotals } from '../pricing/pricing.service';
import { enqueue } from '../notifications/notifications.service';
import { applyTransition } from './order-state';

export type PaymentMethod = 'upi' | 'card' | 'cod';

function genOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ZRO-${ts}-${rand}`;
}

function serializeOrder(order: any, items: any[], lang: Lang) {
  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    region_id: order.region_id,
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    discount: Number(order.discount),
    total: Number(order.total),
    currency: order.currency,
    address: {
      line1: order.address_line1,
      line2: order.address_line2,
      city: order.address_city,
      pincode: order.address_pincode,
      contact_name: order.contact_name,
      contact_phone: order.contact_phone,
    },
    notes: order.notes,
    scheduled_at: order.scheduled_at,
    delivered_at: order.delivered_at,
    created_at: order.created_at,
    items: items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      name: localizeField(it.name, lang),
      unit: it.unit,
      image_url: it.image_url,
      price: Number(it.price),
      quantity: it.quantity,
      line_total: Number(it.line_total),
    })),
  };
}

export async function createOrder(
  userId: string,
  input: { address_id: string; payment_method: PaymentMethod; notes?: string },
  lang: Lang
) {
  const address = await db('addresses').where({ id: input.address_id, user_id: userId }).first();
  if (!address) throw ApiError.notFound();

  // resolve region (+ store) from the address pincode
  const area = await db('service_areas').where({ pincode: address.pincode, is_active: true }).first();
  if (!area) throw new ApiError(422, 'service.unavailable');
  const regionId: string | null = area.region_id ?? null;
  const store = regionId
    ? await db('stores').where({ region_id: regionId, is_active: true }).first()
    : null;

  const cartRows = await db('cart_items as ci')
    .join('products as p', 'p.id', 'ci.product_id')
    .where('ci.user_id', userId)
    .andWhere('p.is_active', true)
    .select('ci.quantity', 'p.*');

  if (cartRows.length === 0) throw new ApiError(400, 'cart.empty');
  for (const r of cartRows) {
    if (r.stock < r.quantity) throw new ApiError(409, 'product.out_of_stock');
  }

  const totals = await computeTotals(
    cartRows.map((r) => ({ price: Number(r.price), quantity: r.quantity })),
    regionId
  );
  if (totals.subtotal < totals.min_order_value) {
    throw new ApiError(400, 'order.min_order', { min_order_value: totals.min_order_value });
  }

  const order = await db.transaction(async (trx) => {
    const [created] = await trx('orders')
      .insert({
        order_number: genOrderNumber(),
        user_id: userId,
        region_id: regionId,
        store_id: store?.id ?? null,
        status: 'placed',
        payment_status: 'pending',
        payment_method: input.payment_method,
        address_line1: address.line1,
        address_line2: address.line2,
        address_city: address.city,
        address_pincode: address.pincode,
        contact_name: address.contact_name,
        contact_phone: address.contact_phone,
        subtotal: totals.subtotal,
        delivery_fee: totals.delivery_fee,
        discount: totals.discount,
        total: totals.total,
        currency: totals.currency,
        notes: input.notes ?? null,
      })
      .returning('*');

    await trx('order_items').insert(
      cartRows.map((r) => ({
        order_id: created.id,
        product_id: r.id,
        name: JSON.stringify(r.name),
        unit: r.unit,
        image_url: r.image_url,
        price: Number(r.price),
        quantity: r.quantity,
        line_total: Number(r.price) * r.quantity,
      }))
    );

    // decrement stock safely (guard against oversell)
    for (const r of cartRows) {
      const affected = await trx('products')
        .where({ id: r.id })
        .andWhere('stock', '>=', r.quantity)
        .decrement('stock', r.quantity);
      if (!affected) throw new ApiError(409, 'product.out_of_stock');
    }

    await trx('order_status_history').insert({ order_id: created.id, to_status: 'placed', changed_by: userId });
    await enqueue(trx, { userId, event: 'order_placed', vars: { order: created.order_number } });

    await trx('cart_items').where({ user_id: userId }).del();
    return created;
  });

  const items = await db('order_items').where({ order_id: order.id });
  return serializeOrder(order, items, lang);
}

export async function listOrders(userId: string, lang: Lang) {
  const orders = await db('orders').where({ user_id: userId }).orderBy('created_at', 'desc');
  const ids = orders.map((o) => o.id);
  const items = ids.length ? await db('order_items').whereIn('order_id', ids) : [];
  return orders.map((o) => serializeOrder(o, items.filter((it) => it.order_id === o.id), lang));
}

export async function getOrder(userId: string, orderId: string, lang: Lang) {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw new ApiError(404, 'order.not_found');
  const items = await db('order_items').where({ order_id: order.id });
  const history = await db('order_status_history').where({ order_id: order.id }).orderBy('created_at', 'asc');
  return { ...serializeOrder(order, items, lang), status_history: history };
}

export async function cancelOrder(userId: string, orderId: string, lang: Lang) {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw new ApiError(404, 'order.not_found');

  await db.transaction(async (trx) => {
    await applyTransition(trx, orderId, 'cancelled', { actorId: userId, reason: 'customer_cancel' });
    const items = await trx('order_items').where({ order_id: orderId });
    for (const it of items) {
      if (it.product_id) await trx('products').where({ id: it.product_id }).increment('stock', it.quantity);
    }
    const active = await trx('delivery_assignments').where({ order_id: orderId }).whereIn('status', ['offered', 'accepted']);
    await trx('delivery_assignments')
      .where({ order_id: orderId })
      .whereIn('status', ['offered', 'accepted'])
      .update({ status: 'expired', responded_at: trx.fn.now() });
    for (const a of active.filter((x) => x.status === 'accepted')) {
      await trx('delivery_boys').where({ user_id: a.delivery_boy_id, availability: 'busy' })
        .update({ availability: 'online', updated_at: trx.fn.now() });
    }
  });

  return getOrder(userId, orderId, lang);
}

export async function rescheduleOrder(userId: string, orderId: string, scheduledAt: string, lang: Lang) {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw new ApiError(404, 'order.not_found');
  await db.transaction(async (trx) => {
    await applyTransition(trx, orderId, 'rescheduled', { actorId: userId, reason: 'customer_reschedule' });
    await trx('orders').where({ id: orderId }).update({ scheduled_at: scheduledAt });
  });
  return getOrder(userId, orderId, lang);
}
