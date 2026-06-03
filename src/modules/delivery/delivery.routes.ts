import { Router } from 'express';
import { z } from 'zod';
import * as svc from './delivery.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired, requireRole('delivery_boy'));

router.get('/me', asyncHandler(async (req, res) => ok(res, await svc.getMe(req.user!.sub))));

const availSchema = z.object({ availability: z.enum(['online', 'offline']) });
router.put(
  '/availability',
  validate({ body: availSchema }),
  asyncHandler(async (req, res) => ok(res, await svc.setAvailability(req.user!.sub, req.body.availability)))
);

router.get(
  '/orders',
  asyncHandler(async (req, res) =>
    ok(res, await svc.listOrders(req.user!.sub, req.lang, req.query.status as string | undefined))
  )
);
router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => ok(res, await svc.getOrder(req.user!.sub, req.params.id, req.lang)))
);

router.post('/orders/:id/accept', asyncHandler(async (req, res) => ok(res, await svc.accept(req.user!.sub, req.params.id))));

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(300) });
router.post(
  '/orders/:id/reject',
  validate({ body: reasonSchema }),
  asyncHandler(async (req, res) => ok(res, await svc.reject(req.user!.sub, req.params.id, req.body.reason)))
);

router.post('/orders/:id/pickup', asyncHandler(async (req, res) => ok(res, await svc.pickup(req.user!.sub, req.params.id))));

const deliverSchema = z.object({ proof_value: z.string().trim().min(1) });
router.post(
  '/orders/:id/deliver',
  validate({ body: deliverSchema }),
  asyncHandler(async (req, res) => ok(res, await svc.deliver(req.user!.sub, req.params.id, req.body.proof_value), 'order.created'))
);

router.post(
  '/orders/:id/fail',
  validate({ body: reasonSchema }),
  asyncHandler(async (req, res) => ok(res, await svc.fail(req.user!.sub, req.params.id, req.body.reason)))
);

router.get('/earnings', asyncHandler(async (req, res) => ok(res, await svc.earnings(req.user!.sub))));

export default router;
