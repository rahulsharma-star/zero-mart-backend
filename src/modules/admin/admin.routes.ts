import { Router } from 'express';
import { z } from 'zod';
import * as svc from './admin.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getAllSettings, setSetting } from '../../services/settings.service';

const router = Router();
router.use(authRequired, requireRole('admin'));

const ml = z.object({ en: z.string().min(1), hi: z.string().optional() });
// Accepts an absolute URL or an uploaded relative path ("/uploads/..").
const imageRef = z.string().refine(
  (v) => /^https?:\/\//.test(v) || v.startsWith('/uploads/'),
  { message: 'must be an image URL or an uploaded path' }
);
const pageQuery = (req: any) => ({
  page: Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1),
  limit: Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20)),
  search: req.query.search as string | undefined,
  status: req.query.status as string | undefined,
});

// ── Dashboard ────────────────────────────────────────────
router.get('/dashboard', asyncHandler(async (_req, res) => ok(res, await svc.dashboard())));

// ── Categories ───────────────────────────────────────────
const categorySchema = z.object({
  name: ml,
  image_url: imageRef.optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
router.get('/categories', asyncHandler(async (_req, res) => ok(res, await svc.listCategories())));
router.post('/categories', validate({ body: categorySchema }), asyncHandler(async (req, res) => ok(res, await svc.createCategory(req.body), 'common.ok', 201)));
router.put('/categories/:id', validate({ body: categorySchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateCategory(req.params.id, req.body))));
router.delete('/categories/:id', asyncHandler(async (req, res) => { await svc.deleteCategory(req.params.id); return ok(res, null); }));

// ── Products ─────────────────────────────────────────────
const productSchema = z.object({
  store_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  name: ml,
  description: ml.partial().optional(),
  unit: z.string().max(60).optional(),
  price: z.number().nonnegative(),
  extra_charge: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  stock: z.number().int().min(0).optional(),
  image_url: imageRef.optional(),
  images: z.array(imageRef).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
router.get('/products', asyncHandler(async (req, res) => ok(res, await svc.listProducts(pageQuery(req)))));
router.post('/products', validate({ body: productSchema }), asyncHandler(async (req, res) => ok(res, await svc.createProduct(req.body), 'common.ok', 201)));
router.put('/products/:id', validate({ body: productSchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateProduct(req.params.id, req.body))));
router.delete('/products/:id', asyncHandler(async (req, res) => { await svc.deleteProduct(req.params.id); return ok(res, null); }));

// ── Orders ───────────────────────────────────────────────
const statusSchema = z.object({
  status: z.enum([
    'placed', 'confirmed', 'preparing', 'ready_for_pickup', 'assigned', 'picked_up',
    'out_for_delivery', 'delivered', 'cancelled', 'failed_delivery', 'rescheduled',
  ]),
});
router.get('/orders', asyncHandler(async (req, res) => ok(res, await svc.listOrders(pageQuery(req)))));
router.get('/orders/:id', asyncHandler(async (req, res) => ok(res, await svc.getOrder(req.params.id))));
router.patch('/orders/:id/status', validate({ body: statusSchema }), asyncHandler(async (req, res) => ok(res, await svc.updateOrderStatus(req.params.id, req.body.status, req.user!.sub))));

// assignment
router.get('/orders/:id/suggest-boys', asyncHandler(async (req, res) => ok(res, await svc.suggestDeliveryBoys(req.params.id))));
const assignSchema = z.object({ delivery_boy_id: z.string().uuid().optional() });
router.post('/orders/:id/assign', validate({ body: assignSchema }), asyncHandler(async (req, res) => ok(res, await svc.assignOrder(req.params.id, req.body.delivery_boy_id, req.user!.sub))));
router.post('/orders/:id/unassign', asyncHandler(async (req, res) => ok(res, await svc.unassignOrder(req.params.id, req.user!.sub))));

// ── Users ────────────────────────────────────────────────
router.get('/users', asyncHandler(async (req, res) => ok(res, await svc.listUsers(pageQuery(req)))));

// ── Banners ──────────────────────────────────────────────
const bannerSchema = z.object({
  title: ml.partial().optional(),
  image_url: imageRef,
  action_type: z.enum(['category', 'product', 'url', 'none']).optional(),
  action_value: z.string().optional(),
  screen: z.enum(['home', 'category', 'cart', 'checkout', 'orders', 'profile', 'shop']).optional(),
  position: z.enum(['top', 'middle', 'bottom', 'footer']).optional(),
  store_id: z.string().uuid().nullable().optional(),
  placement: z.enum(['home', 'shop']).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
router.get('/banners', asyncHandler(async (_req, res) => ok(res, await svc.listBanners())));
router.post('/banners', validate({ body: bannerSchema }), asyncHandler(async (req, res) => ok(res, await svc.createBanner(req.body), 'common.ok', 201)));
router.put('/banners/:id', validate({ body: bannerSchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateBanner(req.params.id, req.body))));
router.post('/banners/:id/approve', asyncHandler(async (req, res) => ok(res, await svc.setBannerStatus(req.params.id, 'approved'))));
router.post('/banners/:id/reject', asyncHandler(async (req, res) => ok(res, await svc.setBannerStatus(req.params.id, 'rejected'))));
router.post('/banners/:id/home', asyncHandler(async (req, res) => ok(res, await svc.pushBannerToHome(req.params.id))));
router.delete('/banners/:id', asyncHandler(async (req, res) => { await svc.deleteBanner(req.params.id); return ok(res, null); }));

// ── Service areas ────────────────────────────────────────
const serviceAreaSchema = z.object({
  pincode: z.string().regex(/^\d{6}$/),
  city: z.string().optional(),
  area_name: z.string().optional(),
  is_active: z.boolean().optional(),
});
router.get('/service-areas', asyncHandler(async (_req, res) => ok(res, await svc.listServiceAreas())));
router.post('/service-areas', validate({ body: serviceAreaSchema }), asyncHandler(async (req, res) => ok(res, await svc.createServiceArea(req.body), 'common.ok', 201)));
router.delete('/service-areas/:id', asyncHandler(async (req, res) => { await svc.deleteServiceArea(req.params.id); return ok(res, null); }));

// ── Settings ─────────────────────────────────────────────
// ── Delivery boys ────────────────────────────────────────
const dboySchema = z.object({
  name: z.string().min(1), phone: z.string().regex(/^[6-9]\d{9}$/), region_id: z.string().uuid(),
  store_id: z.string().uuid().optional(), vehicle_type: z.string().optional(), vehicle_number: z.string().optional(),
  payout_per_order: z.number().min(0).nullable().optional(),
});
router.get('/delivery-boys', asyncHandler(async (req, res) => ok(res, await svc.listDeliveryBoys({ region_id: req.query.region_id as string, availability: req.query.availability as string }))));
router.post('/delivery-boys', validate({ body: dboySchema }), asyncHandler(async (req, res) => ok(res, await svc.createDeliveryBoy(req.body), 'common.ok', 201)));
router.put('/delivery-boys/:id', validate({ body: dboySchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateDeliveryBoy(req.params.id, req.body))));
router.get('/delivery-boys/:id/earnings', asyncHandler(async (req, res) => ok(res, await svc.deliveryBoyEarnings(req.params.id))));
const payoutSchema = z.object({ amount: z.number().positive(), method: z.string().optional(), note: z.string().optional() });
router.post('/delivery-boys/:id/payout', validate({ body: payoutSchema }), asyncHandler(async (req, res) => ok(res, await svc.recordPayout(req.params.id, req.body, req.user!.sub), 'common.ok', 201)));

// ── Regions, pincodes, pricing ───────────────────────────
const regionSchema = z.object({ name: z.string().min(1), city: z.string().min(1), state: z.string().optional(), currency: z.string().length(3).optional(), is_active: z.boolean().optional() });
router.get('/regions', asyncHandler(async (_req, res) => ok(res, await svc.listRegions())));
router.post('/regions', validate({ body: regionSchema }), asyncHandler(async (req, res) => ok(res, await svc.createRegion(req.body), 'common.ok', 201)));
router.put('/regions/:id', validate({ body: regionSchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateRegion(req.params.id, req.body))));
router.get('/regions/:id/pincodes', asyncHandler(async (req, res) => ok(res, await svc.listPincodes(req.params.id))));
const pincodeSchema = z.object({ pincode: z.string().regex(/^\d{6}$/), city: z.string().optional(), area_name: z.string().optional() });
router.post('/regions/:id/pincodes', validate({ body: pincodeSchema }), asyncHandler(async (req, res) => ok(res, await svc.addPincode(req.params.id, req.body), 'common.ok', 201)));
router.delete('/pincodes/:id', asyncHandler(async (req, res) => { await svc.removePincode(req.params.id); return ok(res, null); }));
router.get('/regions/:id/pricing', asyncHandler(async (req, res) => ok(res, await svc.getRegionPricing(req.params.id))));
const pricingSchema = z.object({
  base_delivery_fee: z.number().min(0).optional(), min_order_value: z.number().min(0).optional(),
  free_delivery_above: z.number().min(0).nullable().optional(), surge_multiplier: z.number().min(1).optional(),
  surge_active: z.boolean().optional(), promo_discount: z.number().min(0).optional(),
  urgent_fee: z.number().min(0).nullable().optional(),
});
router.put('/regions/:id/pricing', validate({ body: pricingSchema }), asyncHandler(async (req, res) => ok(res, await svc.updateRegionPricing(req.params.id, req.body))));

// ── Stores (shops) ───────────────────────────────────────
const storeSchema = z.object({
  region_id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  commission_rate: z.number().min(0).max(100).nullable().optional(),
  is_active: z.boolean().optional(),
  owner: z.object({ name: z.string().min(1), phone: z.string().regex(/^[6-9]\d{9}$/) }).optional(),
});
router.get('/stores', asyncHandler(async (req, res) => ok(res, await svc.listStores({ region_id: req.query.region_id as string }))));
router.post('/stores', validate({ body: storeSchema }), asyncHandler(async (req, res) => ok(res, await svc.createStore(req.body), 'common.ok', 201)));
router.put('/stores/:id', validate({ body: storeSchema.partial() }), asyncHandler(async (req, res) => ok(res, await svc.updateStore(req.params.id, req.body))));

const settingsSchema = z.record(z.string(), z.any());
router.get('/settings', asyncHandler(async (_req, res) => ok(res, await getAllSettings())));
router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    for (const [k, v] of Object.entries(body)) await setSetting(k, v);
    return ok(res, await getAllSettings());
  })
);

export default router;
