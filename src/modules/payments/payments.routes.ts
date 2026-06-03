import { Router } from 'express';
import { z } from 'zod';
import * as svc from './payments.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

const initiateSchema = z.object({ order_id: z.string().uuid() });

// Authenticated: get PayU form params for an order
router.post(
  '/payu/initiate',
  authRequired,
  validate({ body: initiateSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await svc.initiatePayu(req.user!.sub, req.body.order_id), 'payment.initiated')
  )
);

// Public: PayU posts here (success + failure share this URL). Verifies hash,
// updates the order, then redirects the app via deep link.
const callback = asyncHandler(async (req, res) => {
  const body = { ...req.body, ...req.query } as Record<string, string>;
  const { orderId, success } = await svc.handlePayuCallback(body);
  // Deep link back into the mobile app (configure scheme in the app).
  const target = `zero://payment/result?orderId=${orderId}&status=${success ? 'success' : 'failed'}`;
  res.redirect(303, target);
});

router.post('/payu/callback', callback);
router.get('/payu/callback', callback);

export default router;
