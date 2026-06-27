import { Request, Response } from 'express';
import * as svc from './catalog.service';
import { getAllSettings } from '../../services/settings.service';
import { ok } from '../../utils/http';

export async function categories(req: Request, res: Response) {
  return ok(res, await svc.listCategories(req.lang));
}

export async function products(req: Request, res: Response) {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const preferredStoreIds = await svc.getPreferredStoreIds(req.user?.sub);
  const result = await svc.listProducts(req.lang, {
    categorySlug: req.query.category as string | undefined,
    search: req.query.search as string | undefined,
    storeId: req.query.store_id as string | undefined,
    preferredStoreIds,
    page,
    limit,
  });
  return ok(res, result);
}

export async function product(req: Request, res: Response) {
  return ok(res, await svc.getProduct(req.lang, req.params.idOrSlug));
}

export async function banners(req: Request, res: Response) {
  return ok(res, await svc.getBanners(req.lang, req.query.screen as string | undefined));
}

export async function stores(req: Request, res: Response) {
  // `?all=1` returns every shop (used by the settings selector); otherwise the
  // customer's pinned-shop preference is applied.
  const all = req.query.all === '1';
  const preferredStoreIds = all ? [] : await svc.getPreferredStoreIds(req.user?.sub);
  const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : undefined;
  const lng = req.query.lng != null ? parseFloat(String(req.query.lng)) : undefined;
  const radiusKm = req.query.radius != null ? parseFloat(String(req.query.radius)) : undefined;
  return ok(
    res,
    await svc.listStores({
      regionId: req.query.region as string | undefined,
      categorySlug: req.query.category as string | undefined,
      preferredStoreIds,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : undefined,
    })
  );
}

export async function store(req: Request, res: Response) {
  return ok(res, await svc.getStore(req.params.id, req.lang));
}

/** Home bootstrap: store info + banners + categories in one call. */
export async function home(req: Request, res: Response) {
  const [settings, bannerList, categoryList] = await Promise.all([
    getAllSettings(),
    svc.getBanners(req.lang, 'home'),
    svc.listCategories(req.lang),
  ]);
  return ok(res, { settings, banners: bannerList, categories: categoryList });
}
