import { Router } from 'express';
import { z } from 'zod';
import * as svc from './cart.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired);

const addSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

const setSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(0).max(99),
});

router.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await svc.getCart(req.user!.sub, req.lang)))
);

router.post(
  '/items',
  validate({ body: addSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await svc.addItem(req.user!.sub, req.body.product_id, req.body.quantity, req.lang), 'cart.item_added')
  )
);

router.put(
  '/items',
  validate({ body: setSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await svc.setQuantity(req.user!.sub, req.body.product_id, req.body.quantity, req.lang))
  )
);

router.delete(
  '/items/:productId',
  asyncHandler(async (req, res) =>
    ok(res, await svc.removeItem(req.user!.sub, req.params.productId, req.lang), 'cart.item_removed')
  )
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await svc.clearCart(req.user!.sub);
    return ok(res, null);
  })
);

export default router;
