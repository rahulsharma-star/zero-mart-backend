import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../../config/db';
import { env } from '../../config/env';
import { sms } from '../../services/sms';
import { ApiError } from '../../utils/ApiError';
import { signToken } from '../../utils/jwt';
import { Lang } from '../../i18n';

const STAFF_ROLES = ['delivery_boy', 'admin', 'super_admin'];
const REFRESH_TTL_DAYS = 60;

async function issueRefreshToken(userId: string, deviceInfo?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400 * 1000);
  await db('refresh_tokens').insert({ user_id: userId, token_hash: tokenHash, device_info: deviceInfo ?? null, expires_at: expiresAt });
  return raw;
}

function generateOtp(): string {
  const min = Math.pow(10, env.otp.length - 1);
  const max = Math.pow(10, env.otp.length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export interface PublicUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: 'customer' | 'admin' | 'delivery';
  language: Lang;
}

function toPublic(u: any): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name ?? null,
    email: u.email ?? null,
    role: u.role,
    language: u.language,
  };
}

/** Create + send an OTP for the given phone. Returns whether the phone is new (signup). */
export async function requestOtp(phone: string, context: 'customer' | 'member' = 'customer'): Promise<{ isNewUser: boolean }> {
  const existing = await db('users').where({ phone }).first();

  // Member Login: only existing staff accounts may receive an OTP here.
  if (context === 'member' && (!existing || !STAFF_ROLES.includes(existing.role))) {
    throw new ApiError(403, 'common.forbidden');
  }

  const purpose = existing ? 'login' : 'signup';

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + env.otp.ttlSeconds * 1000);

  // Invalidate previous unverified OTPs for this phone, then insert new.
  await db('otp_codes').where({ phone }).whereNull('verified_at').del();
  await db('otp_codes').insert({ phone, code_hash: codeHash, purpose, expires_at: expiresAt });

  await sms.sendOtp(phone, code);
  return { isNewUser: !existing };
}

/** Verify OTP; create the user on first login. Returns a JWT + user. */
export async function verifyOtp(input: {
  phone: string;
  code: string;
  name?: string;
  language?: Lang;
}): Promise<{ token: string; accessToken: string; refreshToken: string; user: PublicUser; isNewUser: boolean }> {
  const record = await db('otp_codes')
    .where({ phone: input.phone })
    .whereNull('verified_at')
    .orderBy('created_at', 'desc')
    .first();

  if (!record) throw new ApiError(400, 'auth.otp_invalid');
  if (new Date(record.expires_at).getTime() < Date.now()) throw new ApiError(400, 'auth.otp_invalid');
  if (record.attempts >= env.otp.maxAttempts) throw new ApiError(429, 'auth.otp_too_many');

  const matches = await bcrypt.compare(input.code, record.code_hash);
  if (!matches) {
    await db('otp_codes').where({ id: record.id }).increment('attempts', 1);
    throw new ApiError(400, 'auth.otp_invalid');
  }

  await db('otp_codes').where({ id: record.id }).update({ verified_at: db.fn.now() });

  // upsert user
  let user = await db('users').where({ phone: input.phone }).first();
  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    const [created] = await db('users')
      .insert({
        phone: input.phone,
        name: input.name ?? null,
        language: input.language ?? 'en',
        role: 'customer',
        last_login_at: db.fn.now(),
      })
      .returning('*');
    user = created;
  } else {
    const patch: Record<string, unknown> = { last_login_at: db.fn.now() };
    if (input.name && !user.name) patch.name = input.name;
    if (input.language) patch.language = input.language;
    const [updated] = await db('users').where({ id: user.id }).update(patch).returning('*');
    user = updated;
  }

  const accessToken = signToken({ sub: user.id, role: user.role, phone: user.phone });
  const refreshToken = await issueRefreshToken(user.id);
  // `token` kept for backward compatibility with current clients.
  return { token: accessToken, accessToken, refreshToken, user: toPublic(user), isNewUser };
}

/** Exchange a valid refresh token for a new access + rotated refresh token. */
export async function refreshSession(rawRefresh: string) {
  const tokenHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  const row = await db('refresh_tokens').where({ token_hash: tokenHash }).whereNull('revoked_at').first();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw ApiError.unauthorized();
  const user = await db('users').where({ id: row.user_id }).first();
  if (!user || !user.is_active) throw ApiError.unauthorized();
  // rotate
  await db('refresh_tokens').where({ id: row.id }).update({ revoked_at: db.fn.now() });
  const accessToken = signToken({ sub: user.id, role: user.role, phone: user.phone });
  const refreshToken = await issueRefreshToken(user.id);
  return { token: accessToken, accessToken, refreshToken };
}

export async function logout(rawRefresh: string) {
  const tokenHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  await db('refresh_tokens').where({ token_hash: tokenHash }).update({ revoked_at: db.fn.now() });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw ApiError.notFound();
  return toPublic(user);
}

export async function updateMe(
  userId: string,
  patch: { name?: string; email?: string; language?: Lang }
): Promise<PublicUser> {
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name;
  if (patch.email !== undefined) clean.email = patch.email;
  if (patch.language !== undefined) clean.language = patch.language;
  const [updated] = await db('users').where({ id: userId }).update(clean).returning('*');
  if (!updated) throw ApiError.notFound();
  return toPublic(updated);
}
