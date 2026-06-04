import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { locale } from './middleware/locale';
import { errorHandler, notFoundHandler } from './middleware/error';
import router from './routes';
import { UPLOAD_DIR } from './modules/uploads/uploads.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true })); // PayU posts form-encoded callbacks
  if (!env.isProd) app.use(morgan('dev'));

  app.use(locale);

  app.use(env.apiPrefix, router);

  // Serve uploaded images. CORP override so the admin (different origin) can <img> them.
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
