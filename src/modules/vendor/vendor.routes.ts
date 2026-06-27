import { Router } from 'express';
import { z } from 'zod';
import * as svc from './vendor.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired, requireRole('vendor'));

router.get('/me', asyncHandler(async (req, res) => ok(res, await svc.me(req.user!.sub))));
router.get('/orders', asyncHandler(async (req, res) => ok(res, await svc.listOrders(req.user!.sub, req.query.status as string))));
router.get('/orders/:id', asyncHandler(async (req, res) => ok(res, await svc.getOrder(req.user!.sub, req.params.id))));
router.post('/orders/:id/accept', asyncHandler(async (req, res) => ok(res, await svc.acceptOrder(req.user!.sub, req.params.id))));
router.post(
  '/orders/:id/reject',
  validate({ body: z.object({ reason: z.string().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.rejectOrder(req.user!.sub, req.params.id, req.body.reason)))
);
router.patch(
  '/orders/:id/status',
  validate({ body: z.object({ status: z.enum(['preparing', 'ready_for_pickup']) }) }),
  asyncHandler(async (req, res) => ok(res, await svc.updateStatus(req.user!.sub, req.params.id, req.body.status)))
);

router.get('/offers', asyncHandler(async (req, res) => ok(res, await svc.listOffers(req.user!.sub))));
router.post(
  '/offers/:id/accept',
  validate({ body: z.object({ quoted_price: z.number().positive().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.acceptOffer(req.user!.sub, req.params.id, req.body.quoted_price)))
);
router.post(
  '/offers/:id/reject',
  validate({ body: z.object({ reason: z.string().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.rejectOffer(req.user!.sub, req.params.id, req.body.reason)))
);

// ── Products (vendor manages own shop) ──
const ml = z.object({ en: z.string().optional(), hi: z.string().optional(), mr: z.string().optional() });
const productBody = z.object({
  category_id: z.string().uuid().nullable().optional(),
  name: ml,
  description: ml.optional(),
  unit: z.string().max(60).optional(),
  price: z.number().nonnegative(),
  extra_charge: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  stock: z.number().int().min(0).optional(),
  image_url: z.string().optional(),
  images: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
router.get('/categories', asyncHandler(async (_req, res) => ok(res, await svc.listCategories())));
router.get('/products', asyncHandler(async (req, res) => ok(res, await svc.listProducts(req.user!.sub))));
router.post('/products', validate({ body: productBody }), asyncHandler(async (req, res) => ok(res, await svc.createProduct(req.user!.sub, req.body), 'common.ok', 201)));
router.put('/products/:id', validate({ body: productBody.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateProduct(req.user!.sub, req.params.id, req.body))));
router.delete('/products/:id', asyncHandler(async (req, res) => { await svc.deleteProduct(req.user!.sub, req.params.id); return ok(res, null); }));

// ── Banners / ads ──
router.get('/banners', asyncHandler(async (req, res) => ok(res, await svc.listBanners(req.user!.sub))));
router.post(
  '/banners',
  validate({
    body: z.object({
      image_url: z.string().min(1),
      title: z.object({ en: z.string().optional(), hi: z.string().optional(), mr: z.string().optional() }).optional(),
      placement: z.enum(['shop', 'home']).optional(),
      action_type: z.string().optional(),
      action_value: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await svc.createBanner(req.user!.sub, req.body), 'common.ok', 201))
);
router.delete('/banners/:id', asyncHandler(async (req, res) => {
  await svc.deleteBanner(req.user!.sub, req.params.id);
  return ok(res, null);
}));

export default router;
