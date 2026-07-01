import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { Lang, localizeField } from '../../i18n';
import { Role } from '../../utils/jwt';

const MAX_BODY = 2000;
export type MessageType = 'text' | 'voice';

export interface SendMessageInput {
  body?: string;
  message_type?: MessageType;
  audio_url?: string;
}

export async function openChat(customerUserId: string, productId: string, lang: Lang) {
  const product = await db('products as p')
    .join('stores as s', 's.id', 'p.store_id')
    .where('p.id', productId)
    .where('p.is_active', true)
    .where('s.is_active', true)
    .select('p.id', 'p.name', 'p.image_url', 'p.store_id', 's.name as store_name', 's.owner_user_id')
    .first();
  if (!product) throw ApiError.notFound('product.not_found');

  let chat = await db('product_chats')
    .where({ product_id: productId, customer_user_id: customerUserId })
    .first();

  if (!chat) {
    [chat] = await db('product_chats')
      .insert({
        product_id: productId,
        store_id: product.store_id,
        customer_user_id: customerUserId,
      })
      .returning('*');
  } else {
    await db('product_chats').where({ id: chat.id }).update({ updated_at: db.fn.now() });
  }

  return serializeChat(chat, product, lang);
}

/** Ensure user is the customer or the store's vendor. */
export async function assertChatAccess(chatId: string, userId: string, role: Role) {
  const chat = await db('product_chats as c')
    .join('stores as s', 's.id', 'c.store_id')
    .where('c.id', chatId)
    .select('c.*', 's.owner_user_id')
    .first();
  if (!chat) throw ApiError.notFound('chat.not_found');

  const isCustomer = role === 'customer' && chat.customer_user_id === userId;
  const isVendor = role === 'vendor' && chat.owner_user_id === userId;
  if (!isCustomer && !isVendor) throw ApiError.forbidden('chat.forbidden');

  return chat;
}

export async function getChat(chatId: string, userId: string, role: Role, lang: Lang) {
  const chat = await assertChatAccess(chatId, userId, role);
  const product = await db('products').where({ id: chat.product_id }).first();
  return serializeChat(chat, product, lang);
}

export async function listChats(userId: string, role: Role, lang: Lang) {
  let rows;
  if (role === 'vendor') {
    const store = await db('stores').where({ owner_user_id: userId, is_active: true }).first();
    if (!store) return [];
    rows = await db('product_chats as c')
      .join('products as p', 'p.id', 'c.product_id')
      .join('users as u', 'u.id', 'c.customer_user_id')
      .where('c.store_id', store.id)
      .select('c.*', 'p.name as product_name', 'p.image_url', 'u.name as customer_name', 'u.phone as customer_phone')
      .orderBy('c.updated_at', 'desc')
      .limit(50);
  } else {
    rows = await db('product_chats as c')
      .join('products as p', 'p.id', 'c.product_id')
      .join('stores as s', 's.id', 'c.store_id')
      .where('c.customer_user_id', userId)
      .select('c.*', 'p.name as product_name', 'p.image_url', 's.name as store_name')
      .orderBy('c.updated_at', 'desc')
      .limit(50);
  }

  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    store_id: r.store_id,
    product_name: localizeField(r.product_name, lang),
    product_image: r.image_url,
    store_name: r.store_name ?? undefined,
    customer_name: r.customer_name ?? undefined,
    customer_phone: r.customer_phone ?? undefined,
    updated_at: r.updated_at,
  }));
}

export async function listMessages(
  chatId: string,
  userId: string,
  role: Role,
  opts: { limit?: number; before?: string }
) {
  await assertChatAccess(chatId, userId, role);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 30));
  const q = db('product_chat_messages').where({ chat_id: chatId });
  if (opts.before) q.andWhere('created_at', '<', opts.before);
  const rows = await q.orderBy('created_at', 'desc').limit(limit);
  return rows.reverse().map(serializeMessage);
}

export async function sendMessage(
  chatId: string,
  senderUserId: string,
  role: Role,
  input: SendMessageInput | string
) {
  const chat = await assertChatAccess(chatId, senderUserId, role);
  const payload: SendMessageInput = typeof input === 'string' ? { body: input, message_type: 'text' } : input;
  const messageType: MessageType = payload.message_type === 'voice' ? 'voice' : 'text';

  let body: string | null = null;
  let audioUrl: string | null = null;

  if (messageType === 'voice') {
    audioUrl = String(payload.audio_url || '').trim();
    if (!audioUrl.startsWith('/uploads/')) throw ApiError.badRequest('chat.invalid_audio');
    body = payload.body?.trim() || null;
    if (body && body.length > MAX_BODY) throw ApiError.badRequest('chat.message_too_long');
  } else {
    const text = String(payload.body || '').trim();
    if (!text) throw ApiError.badRequest('chat.empty_message');
    if (text.length > MAX_BODY) throw ApiError.badRequest('chat.message_too_long');
    body = text;
  }

  const isCustomer = role === 'customer' && chat.customer_user_id === senderUserId;
  const isVendor = role === 'vendor' && chat.owner_user_id === senderUserId;
  if (!isCustomer && !isVendor) throw ApiError.forbidden('chat.forbidden');

  const [row] = await db('product_chat_messages')
    .insert({
      chat_id: chatId,
      sender_user_id: senderUserId,
      message_type: messageType,
      body,
      audio_url: audioUrl,
    })
    .returning('*');
  await db('product_chats').where({ id: chatId }).update({ updated_at: db.fn.now() });
  return serializeMessage(row);
}

function serializeMessage(row: {
  id: string;
  chat_id: string;
  sender_user_id: string;
  body: string | null;
  message_type?: string;
  audio_url?: string | null;
  created_at: Date;
}) {
  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_user_id: row.sender_user_id,
    message_type: (row.message_type as MessageType) || 'text',
    body: row.body ?? null,
    audio_url: row.audio_url ?? null,
    created_at: row.created_at,
  };
}

function serializeChat(chat: Record<string, unknown>, product: Record<string, unknown> | undefined, lang: Lang) {
  return {
    id: chat.id,
    product_id: chat.product_id,
    store_id: chat.store_id,
    customer_user_id: chat.customer_user_id,
    product_name: product ? localizeField(product.name, lang) : null,
    product_image: product?.image_url ?? null,
    updated_at: chat.updated_at,
  };
}
