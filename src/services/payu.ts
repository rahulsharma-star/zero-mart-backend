import crypto from 'crypto';
import { env } from '../config/env';

export interface PayuRequestParams {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  hash: string;
}

function sha512(input: string): string {
  return crypto.createHash('sha512').update(input).digest('hex');
}

/**
 * Request hash:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
export function buildRequestHash(p: {
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}): string {
  const { merchantKey: key, merchantSalt: salt } = env.payu;
  const seq = [
    key,
    p.txnid,
    p.amount,
    p.productinfo,
    p.firstname,
    p.email,
    p.udf1 ?? '',
    p.udf2 ?? '',
    p.udf3 ?? '',
    p.udf4 ?? '',
    p.udf5 ?? '',
    '',
    '',
    '',
    '',
    '',
    salt,
  ].join('|');
  return sha512(seq);
}

/**
 * Response/reverse hash to verify a PayU callback:
 * sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function verifyResponseHash(body: Record<string, string>): boolean {
  const { merchantKey: key, merchantSalt: salt } = env.payu;
  const seq = [
    salt,
    body.status ?? '',
    '',
    '',
    '',
    '',
    '',
    body.udf5 ?? '',
    body.udf4 ?? '',
    body.udf3 ?? '',
    body.udf2 ?? '',
    body.udf1 ?? '',
    body.email ?? '',
    body.firstname ?? '',
    body.productinfo ?? '',
    body.amount ?? '',
    body.txnid ?? '',
    key,
  ].join('|');
  const expected = sha512(seq);
  return expected === (body.hash ?? '').toLowerCase();
}

export function buildPaymentRequest(p: {
  txnid: string;
  amount: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  udf1?: string;
}): PayuRequestParams {
  const amount = p.amount.toFixed(2);
  const hash = buildRequestHash({
    txnid: p.txnid,
    amount,
    productinfo: p.productinfo,
    firstname: p.firstname,
    email: p.email,
    udf1: p.udf1,
  });

  return {
    key: env.payu.merchantKey,
    txnid: p.txnid,
    amount,
    productinfo: p.productinfo,
    firstname: p.firstname,
    email: p.email,
    phone: p.phone,
    surl: env.payu.successUrl,
    furl: env.payu.failureUrl,
    udf1: p.udf1,
    hash,
  };
}

export const payuActionUrl = `${env.payu.baseUrl}/_payment`;
