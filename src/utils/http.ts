import { Request, Response, NextFunction } from 'express';
import { t } from '../i18n';

/** Standard success envelope. */
export function ok(res: Response, data: unknown = null, messageKey = 'common.ok', status = 200) {
  return res.status(status).json({
    success: true,
    message: t(messageKey, res.locals.lang),
    data,
  });
}

/** Wrap an async route handler so thrown errors hit the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
