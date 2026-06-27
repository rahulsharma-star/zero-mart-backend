import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { createOrderFromRequest, PaymentMethod } from '../orders/orders.service';

const OFFER_TTL_MINUTES = 15;

/** Broadcast an open request to all active stores in the pincode's region. */
async function broadcastRequest(trx: typeof db, requestId: string, regionId: string) {
  const stores = await trx('stores').where({ region_id: regionId, is_active: true });
  if (stores.length === 0) return;
  await trx('store_order_offers').insert(
    stores.map((s) => ({ open_request_id: requestId, store_id: s.id, status: 'offered' }))
  );
}

export async function createRequest(userId: string, input: { request_text: string; pincode: string }) {
  const area = await db('service_areas').where({ pincode: input.pincode, is_active: true }).first();
  if (!area?.region_id) throw new ApiError(422, 'service.unavailable');

  const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000);

  return db.transaction(async (trx) => {
    const [row] = await trx('open_requests')
      .insert({
        user_id: userId,
        pincode: input.pincode,
        region_id: area.region_id,
        request_text: input.request_text.trim(),
        status: 'pending',
        expires_at: expiresAt,
      })
      .returning('*');

    await broadcastRequest(trx, row.id, area.region_id);
    return serializeRequest(row);
  });
}

export async function getRequest(userId: string, requestId: string) {
  const row = await db('open_requests').where({ id: requestId, user_id: userId }).first();
  if (!row) throw ApiError.notFound();

  let store = null;
  if (row.matched_store_id) {
    store = await db('stores').where({ id: row.matched_store_id }).first();
  }

  return { ...serializeRequest(row), store: store ? { id: store.id, name: store.name, phone: store.phone, whatsapp: store.whatsapp } : null };
}

export async function listRequests(userId: string) {
  const rows = await db('open_requests').where({ user_id: userId }).orderBy('created_at', 'desc').limit(20);
  return rows.map(serializeRequest);
}

export async function confirmRequest(
  userId: string,
  requestId: string,
  input: { address_id: string; payment_method: PaymentMethod },
  lang: string
) {
  const row = await db('open_requests').where({ id: requestId, user_id: userId }).first();
  if (!row) throw ApiError.notFound();
  if (row.status !== 'matched') throw new ApiError(409, 'request.not_matched');
  if (row.matched_order_id) {
    return { order_id: row.matched_order_id, already_confirmed: true };
  }

  const order = await createOrderFromRequest(userId, row, input, lang as any);
  await db('open_requests').where({ id: requestId }).update({
    status: 'confirmed',
    matched_order_id: order.id,
    updated_at: db.fn.now(),
  });
  return { order_id: order.id, order_number: order.order_number };
}

export async function cancelRequest(userId: string, requestId: string) {
  const row = await db('open_requests').where({ id: requestId, user_id: userId }).first();
  if (!row) throw ApiError.notFound();
  if (!['pending', 'matched'].includes(row.status)) throw new ApiError(409, 'request.cannot_cancel');

  await db.transaction(async (trx) => {
    await trx('open_requests').where({ id: requestId }).update({ status: 'cancelled', updated_at: trx.fn.now() });
    await trx('store_order_offers')
      .where({ open_request_id: requestId, status: 'offered' })
      .update({ status: 'expired', responded_at: trx.fn.now() });
  });
  return { ok: true };
}

function serializeRequest(row: any) {
  return {
    id: row.id,
    request_text: row.request_text,
    pincode: row.pincode,
    status: row.status,
    quoted_price: row.quoted_price != null ? Number(row.quoted_price) : null,
    matched_store_id: row.matched_store_id,
    matched_order_id: row.matched_order_id,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}
