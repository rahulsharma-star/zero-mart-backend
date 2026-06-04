import { db } from '../../config/db';
import { Lang, localizeField } from '../../i18n';
import { ApiError } from '../../utils/ApiError';

export function serializeCategory(row: any, lang: Lang) {
  return {
    id: row.id,
    slug: row.slug,
    name: localizeField(row.name, lang),
    image_url: row.image_url,
    sort_order: row.sort_order,
  };
}

export function serializeProduct(row: any, lang: Lang) {
  return {
    id: row.id,
    slug: row.slug,
    category_id: row.category_id,
    name: localizeField(row.name, lang),
    description: localizeField(row.description, lang),
    unit: row.unit,
    price: Number(row.price),
    mrp: row.mrp != null ? Number(row.mrp) : null,
    in_stock: row.stock > 0,
    stock: row.stock,
    image_url: row.image_url,
    images: row.images ?? [],
  };
}

export async function listCategories(lang: Lang) {
  const rows = await db('categories').where({ is_active: true }).orderBy('sort_order', 'asc');
  return rows.map((r) => serializeCategory(r, lang));
}

export async function listProducts(
  lang: Lang,
  opts: { categorySlug?: string; search?: string; page: number; limit: number }
) {
  const query = db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .where('p.is_active', true);

  if (opts.categorySlug) query.andWhere('c.slug', opts.categorySlug);
  if (opts.search) {
    // search within the JSONB name (en + hi)
    query.andWhereRaw(`(p.name->>'en' ILIKE ? OR p.name->>'hi' ILIKE ?)`, [
      `%${opts.search}%`,
      `%${opts.search}%`,
    ]);
  }

  const offset = (opts.page - 1) * opts.limit;
  const [{ count }] = await query.clone().count<{ count: string }[]>('p.id as count');
  const rows = await query
    .clone()
    .select('p.*')
    .orderBy('p.sort_order', 'asc')
    .limit(opts.limit)
    .offset(offset);

  return {
    items: rows.map((r) => serializeProduct(r, lang)),
    total: Number(count),
    page: opts.page,
    limit: opts.limit,
  };
}

export async function getProduct(lang: Lang, idOrSlug: string) {
  const row = await db('products')
    .where({ is_active: true })
    .andWhere((b) => b.where('id', idOrSlug).orWhere('slug', idOrSlug))
    .first();
  if (!row) throw ApiError.notFound();
  return serializeProduct(row, lang);
}

export async function getBanners(lang: Lang, screen?: string) {
  const q = db('banners').where({ is_active: true });
  if (screen) q.andWhere({ screen });
  const rows = await q.orderBy('sort_order', 'asc');
  return rows.map((r) => ({
    id: r.id,
    title: localizeField(r.title, lang),
    image_url: r.image_url,
    action_type: r.action_type,
    action_value: r.action_value,
    screen: r.screen,
    position: r.position,
  }));
}
