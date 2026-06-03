import dotenv from 'dotenv';

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int('PORT', 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    secret: required('JWT_SECRET', 'dev_secret_change_me'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },

  otp: {
    length: int('OTP_LENGTH', 6),
    ttlSeconds: int('OTP_TTL_SECONDS', 300),
    maxAttempts: int('OTP_MAX_ATTEMPTS', 5),
    devMode: bool('OTP_DEV_MODE', true),
  },

  msg91: {
    authKey: process.env.MSG91_AUTH_KEY ?? '',
    senderId: process.env.MSG91_SENDER_ID ?? 'ZERODL',
    templateId: process.env.MSG91_OTP_TEMPLATE_ID ?? '',
    route: process.env.MSG91_ROUTE ?? '4',
  },

  payu: {
    mode: process.env.PAYU_MODE ?? 'test',
    merchantKey: process.env.PAYU_MERCHANT_KEY ?? '',
    merchantSalt: process.env.PAYU_MERCHANT_SALT ?? '',
    baseUrl: process.env.PAYU_BASE_URL ?? 'https://test.payu.in',
    successUrl: process.env.PAYU_SUCCESS_URL ?? '',
    failureUrl: process.env.PAYU_FAILURE_URL ?? '',
    // When true (or when no merchant key is set), online payments skip the
    // gateway and are auto-marked paid — for testing before PayU is integrated.
    devBypass: bool('PAYMENTS_DEV_BYPASS', true) || !process.env.PAYU_MERCHANT_KEY,
  },

  defaults: {
    currency: process.env.DEFAULT_CURRENCY ?? 'INR',
    supportPhone: process.env.SUPPORT_PHONE ?? '',
  },
};

export type Env = typeof env;
