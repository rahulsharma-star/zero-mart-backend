import { Request, Response, NextFunction } from 'express';
import { verifyToken, Role } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

/** Requires a valid Bearer token. Populates req.user. */
export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    next(ApiError.unauthorized());
  }
}

/** Requires the authenticated user to have one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

/** Optional auth — sets req.user when a valid token is present, never errors. */
export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      /* ignore */
    }
  }
  next();
}
