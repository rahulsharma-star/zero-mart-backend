import { Router } from 'express';
import { z } from 'zod';
import * as svc from './subscriptions.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired);

// Available plans (vendor sees these before subscribing).
router.get('/plans', asyncHandler(async (_req, res) => ok(res, await svc.listPlans())));

// Current shop's subscription.
router.get('/me', asyncHandler(async (req, res) => ok(res, await svc.mySubscription(req.user!.sub))));

// Self-serve: register a shop (any logged-in user) → becomes vendor on a free trial.
router.post(
  '/register',
  validate({
    body: z.object({
      shop_name: z.string().trim().min(2).max(120),
      address: z.string().trim().max(300).optional(),
      pincode: z.string().trim().max(10).optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await svc.registerVendor(req.user!.sub, req.body), 'subscription.registered', 201))
);

// Pick a plan and pay (PayU, or dev-bypass).
router.post(
  '/subscribe',
  validate({ body: z.object({ plan_id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.subscribe(req.user!.sub, req.body.plan_id), 'payment.initiated'))
);

export default router;
