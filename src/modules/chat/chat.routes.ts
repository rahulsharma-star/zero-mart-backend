import { Router } from 'express';
import { z } from 'zod';
import * as svc from './chat.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(authRequired);

router.post(
  '/',
  validate({ body: z.object({ product_id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'customer') throw ApiError.forbidden('chat.customers_only');
    return ok(res, await svc.openChat(req.user!.sub, req.body.product_id, req.lang), 'common.ok', 201);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role !== 'customer' && role !== 'vendor') throw ApiError.forbidden('chat.forbidden');
    return ok(res, await svc.listChats(req.user!.sub, role, req.lang));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role !== 'customer' && role !== 'vendor') throw ApiError.forbidden('chat.forbidden');
    return ok(res, await svc.getChat(req.params.id, req.user!.sub, role, req.lang));
  })
);

router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role !== 'customer' && role !== 'vendor') throw ApiError.forbidden('chat.forbidden');
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const before = req.query.before as string | undefined;
    return ok(res, await svc.listMessages(req.params.id, req.user!.sub, role, { limit, before }));
  })
);

router.post(
  '/:id/messages',
  validate({
    body: z
      .object({
        body: z.string().max(2000).optional(),
        message_type: z.enum(['text', 'voice']).optional(),
        audio_url: z.string().max(512).optional(),
      })
      .refine(
        (v) =>
          (v.message_type === 'voice' && !!v.audio_url) ||
          ((!v.message_type || v.message_type === 'text') && !!v.body?.trim()),
        { message: 'chat.empty_message' }
      ),
  }),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role !== 'customer' && role !== 'vendor') throw ApiError.forbidden('chat.forbidden');
    return ok(res, await svc.sendMessage(req.params.id, req.user!.sub, role, req.body), 'common.ok', 201);
  })
);

export default router;
