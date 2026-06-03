import { Request, Response, NextFunction } from 'express';
import { normalizeLang } from '../i18n';

/**
 * Resolves the request language from (in order): ?lang query, x-lang header,
 * Accept-Language header. Stored on req.lang and res.locals.lang.
 */
export function locale(req: Request, res: Response, next: NextFunction) {
  const fromQuery = typeof req.query.lang === 'string' ? req.query.lang : undefined;
  const fromHeader = (req.headers['x-lang'] as string | undefined) ?? req.headers['accept-language'];
  const lang = normalizeLang(fromQuery ?? fromHeader);
  req.lang = lang;
  res.locals.lang = lang;
  next();
}
