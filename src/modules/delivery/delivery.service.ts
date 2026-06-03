import bcrypt from 'bcryptjs';
import { db } from '../../config/db';
import { Lang, localizeField } from '../../i18n';
import { ApiError } from '../../utils/ApiError';
import { applyTransition } from '../orders/order-state';
import { enqueue } from '../notifications/notifications.service';
import { getSetting } from '../../services/settings.service';

function gen4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function requireBoy(userId: string) {
  const boy = await db('delivery_boys').where({ user_id: userId }).first();
  if (!boy) throw ApiError.forbidden();
  return boy;
}

export async function getMe(userId: string) {
  const boy = await requireBoy(userId);
  const user = await db('users').where({ id: userId }).first();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [delivered] = await db('delivery_assignments')
    .where({ delivery_boy_id: userId, status: 'completed' })
    .andWhere('delivered_at', '>=', todayStart)
    .count<{ count: string }[]>('id as count');
  const earnRow = await db('delivery_earnings')
    .where({ delivery_boy_id: userId })
    .andWhere('created_at', '>=', todayStart)
    .sum<{ sum: string }[]>('amount as sum');
  return {
    user: { id: user.id, name: user.name, phone: user.phone, language: user.language },
    availability: boy.availability,
    region_id: boy.region_id,
    today: { delivered: Number(delivered.count), earnings: Number(earnRow[0]?.sum ?? 0) },
    total_deliveries: boy.total_deliveries,
  };
}

export async function setAvailability(userId: string, availability: 'online' | 'offline') {
  await requireBoy(userId);
  await db('delivery_boys').where({ user_id: userId }).update({ availability, updated_at: db.fn.now() });
  return { availability };
}

function summarize(row: any, lang: Lang) {
  return {
    assignment_id: row.assignment_id,
    assignment_status: row.assignment_status,
    payout_amount: Number(row.payout_amount ?? 0),
    order: {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      total: Number(row.total),
      payment_method: row.payment_method,
      address: {
        line1: row.address_line1,
        line2: row.address_line2,
        city: row.address_city,
        pincode: row.address_pincode,
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
      },
      created_at: row.created_at,
    },
  };
}

export async function listOrders(userId: string, lang: Lang, filter?: string) {
  await requireBoy(userId);
  const q = db('delivery_assignments as da')
    .join('orders as o', 'o.id', 'da.order_id')
    .where('da.delivery_boy_id', userId)
    .select(
      'da.id as assignment_id',
      'da.status as assignment_status',
      'da.payout_amount',
      'o.*'
    )
    .orderBy('da.created_at', 'desc');

  if (filter === 'offered') q.where('da.status', 'offered');
  else if (filter === 'active') q.whereIn('da.status', ['accepted']);
  else if (filter === 'completed') q.whereIn('da.status', ['completed']);

  const rows = await q;
  return rows.map((r) => summarize(r, lang));
}

export async function getOrder(userId: string, orderId: string, lang: Lang) {
  await requireBoy(userId);
  // A boy may have several assignments for one order (re-pool churn) —
  // prefer the active one (offered/accepted), else the most recent.
  const a = await db('delivery_assignments')
    .where({ order_id: orderId, delivery_boy_id: userId })
    .orderByRaw(`CASE WHEN status IN ('offered','accepted') THEN 0 ELSE 1 END`)
    .orderBy('created_at', 'desc')
    .first();
  if (!a) throw ApiError.notFound();
  const order = await db('orders').where({ id: orderId }).first();
  const items = await db('order_items').where({ order_id: orderId });
  return {
    assignment: { id: a.id, status: a.status, payout_amount: Number(a.payout_amount) },
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total: Number(order.total),
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      address: {
        line1: order.address_line1, line2: order.address_line2, city: order.address_city,
        pincode: order.address_pincode, contact_name: order.contact_name, contact_phone: order.contact_phone,
      },
      items: items.map((it) => ({ name: localizeField(it.name, lang), unit: it.unit, quantity: it.quantity, price: Number(it.price) })),
    },
  };
}

export async function accept(userId: string, orderId: string) {
  await requireBoy(userId);
  return db.transaction(async (trx) => {
    const a = await trx('delivery_assignments')
      .where({ order_id: orderId, delivery_boy_id: userId, status: 'offered' })
      .forUpdate()
      .first();
    if (!a) throw new ApiError(409, 'order.not_found');
    await trx('delivery_assignments').where({ id: a.id }).update({ status: 'accepted', responded_at: trx.fn.now() });
    await trx('delivery_boys').where({ user_id: userId }).update({ availability: 'busy', updated_at: trx.fn.now() });
    return { ok: true };
  });
}

export async function reject(userId: string, orderId: string, reason: string) {
  await requireBoy(userId);
  return db.transaction(async (trx) => {
    const a = await trx('delivery_assignments')
      .where({ order_id: orderId, delivery_boy_id: userId, status: 'offered' })
      .forUpdate()
      .first();
    if (!a) throw new ApiError(409, 'order.not_found');
    await trx('delivery_assignments').where({ id: a.id }).update({ status: 'rejected', reject_reason: reason, responded_at: trx.fn.now() });
    // re-pool the order
    await applyTransition(trx, orderId, 'ready_for_pickup', { actorId: userId, reason: `boy_reject: ${reason}` });

    // notify region admins to reassign
    const order = await trx('orders').where({ id: orderId }).first();
    const boyUser = await trx('users').where({ id: userId }).first();
    const admins = await trx('users')
      .whereIn('role', ['admin', 'super_admin'])
      .andWhere((b) => b.whereNull('region_id').orWhere('region_id', order.region_id))
      .select('id');
    for (const ad of admins) {
      await enqueue(trx, {
        userId: ad.id,
        event: 'order_rejected',
        vars: { order: order.order_number, boy: boyUser?.name ?? 'partner', reason },
      });
    }
    return { ok: true };
  });
}

/** Pick up from store and head out: assigned → picked_up → out_for_delivery, generate delivery OTP. */
export async function pickup(userId: string, orderId: string) {
  await requireBoy(userId);
  const otp = gen4();
  await db.transaction(async (trx) => {
    const a = await trx('delivery_assignments')
      .where({ order_id: orderId, delivery_boy_id: userId, status: 'accepted' })
      .forUpdate()
      .first();
    if (!a) throw new ApiError(409, 'order.not_found');
    await applyTransition(trx, orderId, 'picked_up', { actorId: userId });
    await applyTransition(trx, orderId, 'out_for_delivery', { actorId: userId, extraVars: { otp } });
    await trx('delivery_assignments')
      .where({ id: a.id })
      .update({ picked_up_at: trx.fn.now(), delivery_otp_hash: await bcrypt.hash(otp, 8) });
  });
  // dev: also log OTP so it can be tested without SMS
  // eslint-disable-next-line no-console
  console.log(`\n🚚 [DEV] delivery OTP for order ${orderId} = ${otp}\n`);
  return { ok: true };
}

export async function deliver(userId: string, orderId: string, proofValue: string) {
  const boy = await requireBoy(userId);
  return db.transaction(async (trx) => {
    const a = await trx('delivery_assignments')
      .where({ order_id: orderId, delivery_boy_id: userId, status: 'accepted' })
      .forUpdate()
      .first();
    if (!a) throw new ApiError(409, 'order.not_found');
    if (!a.delivery_otp_hash || !(await bcrypt.compare(proofValue, a.delivery_otp_hash))) {
      throw new ApiError(400, 'payment.invalid_signature'); // reuse generic invalid message
    }
    const payout =
      boy.payout_per_order != null
        ? Number(boy.payout_per_order)
        : await getSetting<number>('delivery_payout_per_order', 25);
    await applyTransition(trx, orderId, 'delivered', { actorId: userId });
    await trx('delivery_assignments').where({ id: a.id }).update({
      status: 'completed', delivered_at: trx.fn.now(), proof_type: 'otp', payout_amount: payout,
    });
    await trx('delivery_earnings').insert({ delivery_boy_id: userId, assignment_id: a.id, amount: payout, type: 'delivery' });
    await trx('delivery_boys').where({ user_id: userId }).update({
      availability: 'online', total_deliveries: trx.raw('total_deliveries + 1'), updated_at: trx.fn.now(),
    });
    // COD: mark paid on delivery
    await trx('orders').where({ id: orderId, payment_method: 'cod' }).update({ payment_status: 'paid' });
    return { ok: true, payout_amount: payout };
  });
}

export async function fail(userId: string, orderId: string, reason: string) {
  await requireBoy(userId);
  return db.transaction(async (trx) => {
    const a = await trx('delivery_assignments')
      .where({ order_id: orderId, delivery_boy_id: userId, status: 'accepted' })
      .forUpdate()
      .first();
    if (!a) throw new ApiError(409, 'order.not_found');
    await applyTransition(trx, orderId, 'failed_delivery', { actorId: userId, reason });
    await trx('delivery_assignments').where({ id: a.id }).update({ status: 'completed', reject_reason: reason });
    await trx('delivery_boys').where({ user_id: userId }).update({ availability: 'online', updated_at: trx.fn.now() });
    return { ok: true };
  });
}

export async function earnings(userId: string) {
  await requireBoy(userId);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const sum = async (from?: Date) => {
    const q = db('delivery_earnings').where({ delivery_boy_id: userId });
    if (from) q.andWhere('created_at', '>=', from);
    const r = await q.sum<{ sum: string }[]>('amount as sum');
    return Number(r[0]?.sum ?? 0);
  };
  const items = await db('delivery_earnings').where({ delivery_boy_id: userId }).orderBy('created_at', 'desc').limit(50);
  const paidRow = await db('delivery_payouts').where({ delivery_boy_id: userId }).sum<{ sum: string }[]>('amount as sum');
  const totalEarned = await sum();
  const totalPaid = Number(paidRow[0]?.sum ?? 0);
  return {
    today: await sum(todayStart),
    week: await sum(weekStart),
    total: totalEarned,
    paid: totalPaid,
    due: Math.round((totalEarned - totalPaid) * 100) / 100,
    items: items.map((i) => ({ id: i.id, amount: Number(i.amount), type: i.type, created_at: i.created_at })),
  };
}
