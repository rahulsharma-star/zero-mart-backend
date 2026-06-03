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
  const result = await svc.listProducts(req.lang, {
    categorySlug: req.query.category as string | undefined,
    search: req.query.search as string | undefined,
    page,
    limit,
  });
  return ok(res, result);
}

export async function product(req: Request, res: Response) {
  return ok(res, await svc.getProduct(req.lang, req.params.idOrSlug));
}

export async function banners(req: Request, res: Response) {
  return ok(res, await svc.getBanners(req.lang));
}

/** Home bootstrap: store info + banners + categories in one call. */
export async function home(req: Request, res: Response) {
  const [settings, bannerList, categoryList] = await Promise.all([
    getAllSettings(),
    svc.getBanners(req.lang),
    svc.listCategories(req.lang),
  ]);
  return ok(res, { settings, banners: bannerList, categories: categoryList });
}
