import { Knex } from 'knex';
import { ApiError } from '../../utils/ApiError';
import { enqueue } from '../notifications/notifications.service';

export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed_delivery',
  'rescheduled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed transitions (state machine). Empty arrays are terminal. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['assigned', 'cancelled'],
  assigned: ['ready_for_pickup', 'picked_up'],
  picked_up: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  failed_delivery: ['rescheduled', 'cancelled'],
  rescheduled: ['assigned'],
  delivered: [],
  cancelled: [],
};

const NOTIFY_EVENTS = new Set(['confirmed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled']);

/**
 * Apply a validated status transition inside a transaction:
 * checks the state machine, updates the order, writes history, enqueues a notification.
 */
export async function applyTransition(
  trx: Knex.Transaction,
  orderId: string,
  to: OrderStatus,
  opts: { actorId?: string; reason?: string; extraVars?: Record<string, string> } = {}
) {
  const order = await trx('orders').where({ id: orderId }).forUpdate().first();
  if (!order) throw new ApiError(404, 'order.not_found');
  const from = order.status as OrderStatus;
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, 'order.invalid_transition', { from, to });
  }

  const patch: Record<string, unknown> = { status: to, updated_at: trx.fn.now() };
  if (to === 'delivered') patch.delivered_at = trx.fn.now();
  await trx('orders').where({ id: orderId }).update(patch);

  await trx('order_status_history').insert({
    order_id: orderId,
    from_status: from,
    to_status: to,
    changed_by: opts.actorId ?? null,
    reason: opts.reason ?? null,
  });

  if (NOTIFY_EVENTS.has(to)) {
    await enqueue(trx, {
      userId: order.user_id,
      event: to,
      vars: { order: order.order_number, ...(opts.extraVars ?? {}) },
    });
  }

  return { ...order, ...patch };
}
