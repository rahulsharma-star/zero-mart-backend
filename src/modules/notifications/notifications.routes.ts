import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import * as svc from './notifications.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => ok(res, await svc.listForUser(req.user!.sub, req.lang))));

const deviceSchema = z.object({ token: z.string().min(1), platform: z.enum(['android', 'ios']) });
router.post(
  '/devices',
  validate({ body: deviceSchema }),
  asyncHandler(async (req, res) => {
    await db('device_tokens')
      .insert({ user_id: req.user!.sub, token: req.body.token, platform: req.body.platform, is_active: true })
      .onConflict('token')
      .merge({ user_id: req.user!.sub, is_active: true });
    return ok(res, null);
  })
);

export default router;
