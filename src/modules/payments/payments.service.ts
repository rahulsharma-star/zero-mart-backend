import { db } from '../../config/db';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { applyTransition } from '../orders/order-state';
import {
  buildPaymentRequest,
  payuActionUrl,
  verifyResponseHash,
  PayuRequestParams,
} from '../../services/payu';

function genTxnId(orderNumber: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${orderNumber.replace(/[^A-Z0-9]/gi, '')}${rand}`.slice(0, 40);
}

/** Build the PayU form params for an order's online payment. */
export async function initiatePayu(userId: string, orderId: string) {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw new ApiError(404, 'order.not_found');
  if (order.payment_method === 'cod') throw ApiError.badRequest();
  if (order.payment_status === 'paid') throw ApiError.badRequest();

  const user = await db('users').where({ id: userId }).first();
  const txnid = genTxnId(order.order_number);

  // ── DEV BYPASS: no gateway yet → mark paid + confirm the order ──
  if (env.payu.devBypass) {
    await db.transaction(async (trx) => {
      await trx('payments').insert({
        order_id: order.id, gateway: 'dev-bypass', txnid, method: order.payment_method,
        amount: order.total, status: 'success',
        raw_response: JSON.stringify({ bypass: true }),
      });
      await trx('orders').where({ id: order.id }).update({ payment_status: 'paid' });
      await applyTransition(trx, order.id, 'confirmed', { actorId: userId, reason: 'payment_dev_bypass' });
    });
    return { bypass: true, orderId: order.id };
  }

  // record a pending payment attempt
  await db('payments').insert({
    order_id: order.id,
    gateway: 'payu',
    txnid,
    method: order.payment_method,
    amount: order.total,
    status: 'pending',
  });

  const params: PayuRequestParams = buildPaymentRequest({
    txnid,
    amount: Number(order.total),
    productinfo: `Order ${order.order_number}`,
    firstname: user?.name ?? 'Customer',
    email: user?.email ?? 'customer@zero.local',
    phone: user?.phone ?? '',
    udf1: order.id,
  });

  return { action: payuActionUrl, params, mode: env.payu.mode };
}

/** Handle PayU's server-to-server / redirect callback. Returns the resolved order id + status. */
export async function handlePayuCallback(body: Record<string, string>) {
  const valid = verifyResponseHash(body);
  if (!valid) throw new ApiError(400, 'payment.invalid_signature');

  const txnid = body.txnid;
  const payment = await db('payments').where({ txnid }).first();
  if (!payment) throw new ApiError(404, 'order.not_found');

  const success = (body.status ?? '').toLowerCase() === 'success';

  await db.transaction(async (trx) => {
    await trx('payments').where({ id: payment.id }).update({
      status: success ? 'success' : 'failed',
      gateway_payment_id: body.mihpayid ?? null,
      method: body.mode ?? payment.method,
      raw_response: JSON.stringify(body),
      updated_at: trx.fn.now(),
    });

    await trx('orders')
      .where({ id: payment.order_id })
      .update({
        payment_status: success ? 'paid' : 'failed',
        status: success ? 'confirmed' : 'pending',
        updated_at: trx.fn.now(),
      });
  });

  return { orderId: payment.order_id, success };
}
