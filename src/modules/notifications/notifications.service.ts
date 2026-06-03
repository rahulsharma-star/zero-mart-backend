import { Knex } from 'knex';
import { db } from '../../config/db';
import { sms } from '../../services/sms';

/** Multilingual templates per event. Recipient language picks the string. */
const TEMPLATES: Record<string, { title: { en: string; hi: string }; body: { en: string; hi: string }; channels: string[] }> = {
  order_placed: {
    title: { en: 'Order placed', hi: 'ऑर्डर हो गया' },
    body: { en: 'Your order {order} has been placed.', hi: 'आपका ऑर्डर {order} दे दिया गया है।' },
    channels: ['push', 'inapp'],
  },
  confirmed: {
    title: { en: 'Order confirmed', hi: 'ऑर्डर कन्फर्म' },
    body: { en: 'Order {order} is confirmed.', hi: 'ऑर्डर {order} कन्फर्म हो गया।' },
    channels: ['push', 'inapp'],
  },
  assigned: {
    title: { en: 'Order assigned', hi: 'ऑर्डर असाइन' },
    body: { en: 'A delivery partner is assigned to {order}.', hi: '{order} के लिए डिलीवरी पार्टनर असाइन हुआ।' },
    channels: ['push', 'inapp'],
  },
  out_for_delivery: {
    title: { en: 'Out for delivery', hi: 'डिलीवरी पर निकला' },
    body: { en: 'Order {order} is out for delivery. OTP: {otp}', hi: 'ऑर्डर {order} डिलीवरी पर है। OTP: {otp}' },
    channels: ['push', 'sms', 'inapp'],
  },
  delivered: {
    title: { en: 'Delivered', hi: 'डिलीवर हो गया' },
    body: { en: 'Order {order} delivered. Enjoy!', hi: 'ऑर्डर {order} डिलीवर हो गया। धन्यवाद!' },
    channels: ['push', 'inapp'],
  },
  cancelled: {
    title: { en: 'Order cancelled', hi: 'ऑर्डर रद्द' },
    body: { en: 'Order {order} was cancelled.', hi: 'ऑर्डर {order} रद्द कर दिया गया।' },
    channels: ['push', 'sms', 'inapp'],
  },
  delivery_assigned_boy: {
    title: { en: 'New delivery', hi: 'नई डिलीवरी' },
    body: { en: 'You have a new order {order} to deliver.', hi: 'आपके पास डिलीवर करने के लिए नया ऑर्डर {order} है।' },
    channels: ['push', 'inapp'],
  },
  order_rejected: {
    title: { en: 'Order needs reassignment', hi: 'ऑर्डर दोबारा असाइन करें' },
    body: { en: '{order} was rejected by {boy} ({reason}). Please reassign.', hi: '{order} को {boy} ने अस्वीकार किया ({reason})। कृपया दोबारा असाइन करें।' },
    channels: ['inapp', 'push'],
  },
};

function fill(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Queue a notification (transactional outbox). Call inside the same trx as the state change. */
export async function enqueue(
  trx: Knex | Knex.Transaction,
  opts: { userId: string; event: string; vars?: Record<string, string>; channelsOverride?: string[] }
) {
  const tpl = TEMPLATES[opts.event];
  if (!tpl) return;
  const vars = opts.vars ?? {};
  const channels = opts.channelsOverride ?? tpl.channels;
  await (trx as Knex)('notifications').insert(
    channels.map((channel) => ({
      user_id: opts.userId,
      channel,
      event: opts.event,
      title: JSON.stringify(tpl.title),
      body: JSON.stringify({ en: fill(tpl.body.en, vars), hi: fill(tpl.body.hi, vars) }),
      data: JSON.stringify(vars),
      status: 'pending',
    }))
  );
}

/**
 * Drain pending notifications. In dev this logs; sms goes through MSG91 (dev-mode logs).
 * Run on an interval from the server, or via a dedicated worker/queue at scale.
 */
export async function processOutbox(limit = 50): Promise<number> {
  const pending = await db('notifications').where({ status: 'pending' }).orderBy('created_at', 'asc').limit(limit);
  for (const n of pending) {
    try {
      if (n.channel === 'sms') {
        const user = await db('users').where({ id: n.user_id }).first();
        const lang = user?.language ?? 'en';
        const body = (n.body?.[lang] ?? n.body?.en) || '';
        if (user?.phone) await sms.sendOtp(user.phone, body); // dev: logs; prod: use a transactional SMS template
      } else {
        // push/email/inapp — dev: log. Wire FCM/SES here in prod.
        // eslint-disable-next-line no-console
        console.log(`🔔 [${n.channel}] event=${n.event} user=${n.user_id}`);
      }
      await db('notifications').where({ id: n.id }).update({ status: 'sent', sent_at: db.fn.now() });
    } catch {
      await db('notifications').where({ id: n.id }).update({ status: 'failed' }).increment('retries', 1);
    }
  }
  return pending.length;
}

export async function listForUser(userId: string, lang: 'en' | 'hi') {
  const rows = await db('notifications')
    .where({ user_id: userId })
    .whereIn('channel', ['inapp', 'push'])
    .orderBy('created_at', 'desc')
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    title: r.title?.[lang] ?? r.title?.en,
    body: r.body?.[lang] ?? r.body?.en,
    status: r.status,
    created_at: r.created_at,
  }));
}
