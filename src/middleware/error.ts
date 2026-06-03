import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { t } from '../i18n';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: t('common.not_found', res.locals.lang),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const lang = res.locals.lang ?? 'en';

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: t('common.validation_failed', lang),
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof ApiError) {
    const vars =
      err.details && typeof err.details === 'object' && !Array.isArray(err.details)
        ? (err.details as Record<string, string | number>)
        : undefined;
    return res.status(err.statusCode).json({
      success: false,
      message: t(err.messageKey, lang, vars),
      ...(err.details ? { errors: err.details } : {}),
    });
  }

  // Unexpected
  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  return res.status(500).json({
    success: false,
    message: t('common.server_error', lang),
    ...(env.isProd ? {} : { debug: (err as Error)?.message }),
  });
}
