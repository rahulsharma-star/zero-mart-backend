import { Lang } from '../i18n';
import { JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      lang: Lang;
      user?: JwtPayload;
    }
  }
}

export {};
