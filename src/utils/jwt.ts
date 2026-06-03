import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type Role = 'customer' | 'delivery_boy' | 'admin' | 'super_admin';

export interface JwtPayload {
  sub: string; // user id
  role: Role;
  phone: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.secret) as JwtPayload;
}
