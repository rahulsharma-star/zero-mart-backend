import { Router } from 'express';
import { z } from 'zod';
import * as svc from './orders.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired);

const createSchema = z.object({
  address_id: z.string().uuid(),
  payment_method: z.enum(['upi', 'card', 'cod']),
  notes: z.string().trim().max(500).optional(),
  is_urgent: z.boolean().optional(),
});

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await svc.createOrder(req.user!.sub, req.body, req.lang), 'order.created', 201)
  )
);

router.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await svc.listOrders(req.user!.sub, req.lang)))
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await svc.getOrder(req.user!.sub, req.params.id, req.lang)))
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => ok(res, await svc.cancelOrder(req.user!.sub, req.params.id, req.lang)))
);

const rescheduleSchema = z.object({ scheduled_at: z.string().min(1) });
router.post(
  '/:id/reschedule',
  validate({ body: rescheduleSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await svc.rescheduleOrder(req.user!.sub, req.params.id, req.body.scheduled_at, req.lang))
  )
);

export default router;
