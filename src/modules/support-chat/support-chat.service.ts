import { db } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { Role } from '../../utils/jwt';

const MAX_BODY = 2000;
type MessageType = 'text' | 'voice';

export interface SendSupportMessageInput {
  body?: string;
  message_type?: MessageType;
  audio_url?: string;
}

async function getVendorStore(userId: string) {
  return db('stores').where({ owner_user_id: userId, is_active: true }).first();
}

export async function assertSupportChatAccess(chatId: string, userId: string, role: Role) {
  const chat = await db('admin_vendor_chats as c')
    .join('stores as s', 's.id', 'c.store_id')
    .where('c.id', chatId)
    .select('c.*', 's.owner_user_id', 's.name as store_name')
    .first();
  if (!chat) throw ApiError.notFound('chat.not_found');

  const isSuperAdmin = role === 'super_admin' || role === 'admin';
  const isVendor = role === 'vendor' && chat.owner_user_id === userId;
  if (!isSuperAdmin && !isVendor) throw ApiError.forbidden('chat.forbidden');

  return chat;
}

async function getOrCreateChatByStore(storeId: string) {
  let chat = await db('admin_vendor_chats').where({ store_id: storeId }).first();
  if (!chat) {
    [chat] = await db('admin_vendor_chats').insert({ store_id: storeId }).returning('*');
  } else {
    await db('admin_vendor_chats').where({ id: chat.id }).update({ updated_at: db.fn.now() });
  }
  return chat;
}

export async function listChatsForAdmin() {
  const rows = await db('admin_vendor_chats as c')
    .join('stores as s', 's.id', 'c.store_id')
    .join('users as u', 'u.id', 's.owner_user_id')
    .select('c.*', 's.name as store_name', 's.shop_code', 'u.name as vendor_name', 'u.phone as vendor_phone')
    .orderBy('c.updated_at', 'desc')
    .limit(100);

  const withPreview = await Promise.all(
    rows.map(async (r) => {
      const last = await db('admin_vendor_chat_messages')
        .where({ chat_id: r.id })
        .orderBy('created_at', 'desc')
        .first();
      return { ...r, last_message: last?.body ?? null, last_message_at: last?.created_at ?? null };
    })
  );
  return withPreview;
}

export async function openChatForAdmin(storeId: string) {
  const store = await db('stores as s')
    .join('users as u', 'u.id', 's.owner_user_id')
    .where('s.id', storeId)
    .select('s.*', 'u.name as vendor_name', 'u.phone as vendor_phone')
    .first();
  if (!store) throw ApiError.notFound('store.not_found');

  const chat = await getOrCreateChatByStore(storeId);
  return { ...chat, store_name: store.name, shop_code: store.shop_code, vendor_name: store.vendor_name, vendor_phone: store.vendor_phone };
}

export async function openChatForVendor(vendorUserId: string) {
  const store = await getVendorStore(vendorUserId);
  if (!store) throw ApiError.notFound('vendor.no_store');

  const chat = await getOrCreateChatByStore(store.id);
  return { ...chat, store_name: store.name, shop_code: store.shop_code };
}

export async function getChat(chatId: string, userId: string, role: Role) {
  return assertSupportChatAccess(chatId, userId, role);
}

export async function listMessages(chatId: string, userId: string, role: Role, opts: { limit?: number; before?: string }) {
  await assertSupportChatAccess(chatId, userId, role);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 30));
  const q = db('admin_vendor_chat_messages').where({ chat_id: chatId }).orderBy('created_at', 'desc').limit(limit);
  if (opts.before) q.where('created_at', '<', opts.before);
  const rows = await q;
  return rows.reverse();
}

export async function sendMessage(chatId: string, userId: string, role: Role, input: SendSupportMessageInput | string) {
  await assertSupportChatAccess(chatId, userId, role);

  const payload: SendSupportMessageInput = typeof input === 'string' ? { body: input, message_type: 'text' } : input;
  const messageType: MessageType = payload.message_type === 'voice' ? 'voice' : 'text';
  let body: string | null = null;
  let audioUrl: string | null = null;

  if (messageType === 'voice') {
    audioUrl = String(payload.audio_url || '').trim();
    if (!audioUrl.startsWith('/uploads/')) throw ApiError.badRequest('chat.invalid_audio');
  } else {
    body = String(payload.body || '').trim();
    if (!body) throw ApiError.badRequest('chat.empty_message');
    if (body.length > MAX_BODY) throw ApiError.badRequest('chat.too_long');
  }

  const [row] = await db('admin_vendor_chat_messages')
    .insert({
      chat_id: chatId,
      sender_user_id: userId,
      message_type: messageType,
      body,
      audio_url: audioUrl,
    })
    .returning('*');

  await db('admin_vendor_chats').where({ id: chatId }).update({ updated_at: db.fn.now() });

  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_user_id: row.sender_user_id,
    message_type: row.message_type,
    body: row.body,
    audio_url: row.audio_url,
    created_at: row.created_at,
  };
}
