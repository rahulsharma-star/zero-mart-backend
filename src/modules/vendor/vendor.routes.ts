import { Router } from 'express';
import { z } from 'zod';
import * as svc from './vendor.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as supportSvc from '../support-chat/support-chat.service';
import * as khataSvc from '../khata/khata.service';

const router = Router();
router.use(authRequired, requireRole('vendor'));

// ── Khata (udhaar) — vendor manages customers' shop credit ──
router.get('/khata', asyncHandler(async (req, res) => {
  const store = await svc.getVendorStore(req.user!.sub);
  return ok(res, await khataSvc.listForStore(store.id));
}));
router.post(
  '/khata/limit',
  validate({
    body: z.object({
      phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
      customer_user_id: z.string().uuid().optional(),
      credit_limit: z.number().nonnegative(),
      is_active: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const store = await svc.getVendorStore(req.user!.sub);
    return ok(res, await khataSvc.upsertLimit(store.id, req.body), 'khata.updated');
  })
);
router.post(
  '/khata/payment',
  validate({
    body: z.object({
      customer_user_id: z.string().uuid(),
      amount: z.number().positive(),
      note: z.string().max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const store = await svc.getVendorStore(req.user!.sub);
    return ok(res, await khataSvc.recordPayment(store.id, req.body, req.user!.sub), 'khata.payment_recorded');
  })
);

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
  attributes: z.record(z.any()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
router.get('/categories', asyncHandler(async (req, res) => ok(res, await svc.listCategories(req.user!.sub))));
const categoryBody = z.object({
  name: ml,
  image_url: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
router.post('/categories', validate({ body: categoryBody }), asyncHandler(async (req, res) => ok(res, await svc.createCategory(req.user!.sub, req.body), 'common.ok', 201)));
router.put('/categories/:id', validate({ body: categoryBody.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateCategory(req.user!.sub, req.params.id, req.body))));
router.delete('/categories/:id', asyncHandler(async (req, res) => { await svc.deleteCategory(req.user!.sub, req.params.id); return ok(res, null); }));
router.post('/categories/:id/request-feature', asyncHandler(async (req, res) => ok(res, await svc.requestCategoryFeature(req.user!.sub, req.params.id))));
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

// ── Scrolling notices (website sidebar) ──
const noticeBody = z.object({
  message: z.object({ en: z.string().optional(), hi: z.string().optional(), mr: z.string().optional() }),
  is_active: z.boolean().optional(),
});
router.get('/notices', asyncHandler(async (req, res) => ok(res, await svc.listNotices(req.user!.sub))));
router.post('/notices', validate({ body: noticeBody }), asyncHandler(async (req, res) => ok(res, await svc.createNotice(req.user!.sub, req.body), 'common.ok', 201)));
router.put('/notices/:id', validate({ body: noticeBody.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateNotice(req.user!.sub, req.params.id, req.body))));
router.delete('/notices/:id', asyncHandler(async (req, res) => { await svc.deleteNotice(req.user!.sub, req.params.id); return ok(res, null); }));

// ── Delivery boys (vendor's own riders) ──
const boyBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  vehicle_type: z.string().max(30).optional(),
  vehicle_number: z.string().max(20).optional(),
});
router.get('/delivery-boys', asyncHandler(async (req, res) => ok(res, await svc.listDeliveryBoys(req.user!.sub))));
router.post('/delivery-boys', validate({ body: boyBody }), asyncHandler(async (req, res) => ok(res, await svc.createDeliveryBoy(req.user!.sub, req.body), 'common.ok', 201)));
router.put(
  '/delivery-boys/:id',
  validate({ body: boyBody.partial().extend({ is_active: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.updateDeliveryBoy(req.user!.sub, req.params.id, req.body)))
);
router.post(
  '/orders/:id/assign',
  validate({ body: z.object({ delivery_boy_id: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await svc.assignDeliveryBoy(req.user!.sub, req.params.id, req.body.delivery_boy_id)))
);
router.post('/orders/:id/unassign', asyncHandler(async (req, res) => ok(res, await svc.unassignDeliveryBoy(req.user!.sub, req.params.id))));

// ── Support chat with platform admin ─────────────────────
router.get('/support-chat', asyncHandler(async (req, res) => ok(res, await supportSvc.openChatForVendor(req.user!.sub))));
router.get('/support-chat/messages', asyncHandler(async (req, res) => {
  const chat = await supportSvc.openChatForVendor(req.user!.sub);
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  const before = req.query.before as string | undefined;
  return ok(res, await supportSvc.listMessages(chat.id, req.user!.sub, req.user!.role, { limit, before }));
}));
router.post(
  '/support-chat/messages',
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
    const chat = await supportSvc.openChatForVendor(req.user!.sub);
    return ok(res, await supportSvc.sendMessage(chat.id, req.user!.sub, req.user!.role, req.body), 'common.ok', 201);
  })
);

export default router;
