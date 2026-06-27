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

/** Final price the customer pays = base price + vendor's per-product extra charge. */
export function effectivePrice(row: any): number {
  return Number(row.price) + Number(row.extra_charge ?? 0);
}

export function serializeProduct(row: any, lang: Lang) {
  return {
    id: row.id,
    slug: row.slug,
    category_id: row.category_id,
    store_id: row.store_id ?? null,
    store_name: row.store_name ?? null,
    name: localizeField(row.name, lang),
    description: localizeField(row.description, lang),
    unit: row.unit,
    price: effectivePrice(row),
    base_price: Number(row.price),
    extra_charge: Number(row.extra_charge ?? 0),
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

/** Read a customer's pinned-shop preference (empty = no filter). */
export async function getPreferredStoreIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const u = await db('users').where({ id: userId }).first();
  const v = u?.preferred_store_ids;
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function listProducts(
  lang: Lang,
  opts: {
    categorySlug?: string;
    search?: string;
    storeId?: string;
    preferredStoreIds?: string[];
    page: number;
    limit: number;
  }
) {
  const query = db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin('stores as s', 's.id', 'p.store_id')
    .where('p.is_active', true);

  if (opts.categorySlug) query.andWhere('c.slug', opts.categorySlug);
  if (opts.storeId) query.andWhere('p.store_id', opts.storeId);
  // Customer "preferred shops": restrict browsing/search to pinned shops only.
  // Skipped when a specific store is requested (direct shop page / product link).
  else if (opts.preferredStoreIds && opts.preferredStoreIds.length) {
    query.whereIn('p.store_id', opts.preferredStoreIds);
  }
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
    .select('p.*', 's.name as store_name')
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
  const row = await db('products as p')
    .leftJoin('stores as s', 's.id', 'p.store_id')
    .where('p.is_active', true)
    .andWhere((b) => b.where('p.id', idOrSlug).orWhere('p.slug', idOrSlug))
    .select('p.*', 's.name as store_name')
    .first();
  if (!row) throw ApiError.notFound();
  return serializeProduct(row, lang);
}

export function serializeStore(row: any) {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    region_id: row.region_id,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    product_count: row.product_count != null ? Number(row.product_count) : undefined,
    distance_km: row.distance_km != null ? Math.round(row.distance_km * 10) / 10 : undefined,
  };
}

/** Great-circle distance in km between two lat/lng points (Haversine, no API key). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * List active shops, optionally filtered by region / category / preferred set.
 * When `lat`+`lng` are given, shops are sorted nearest-first and each carries
 * `distance_km`. Shops without coordinates go to the end.
 */
export async function listStores(opts: {
  regionId?: string;
  categorySlug?: string;
  preferredStoreIds?: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
}) {
  const q = db('stores as s').where('s.is_active', true);
  if (opts.regionId) q.andWhere('s.region_id', opts.regionId);
  if (opts.preferredStoreIds && opts.preferredStoreIds.length) {
    q.whereIn('s.id', opts.preferredStoreIds);
  }
  if (opts.categorySlug) {
    q.whereExists(function () {
      this.select(db.raw('1'))
        .from('products as p')
        .join('categories as c', 'c.id', 'p.category_id')
        .whereRaw('p.store_id = s.id')
        .andWhere('p.is_active', true)
        .andWhere('c.slug', opts.categorySlug!);
    });
  }

  const rows = await q.select('s.*');
  const hasLoc = opts.lat != null && opts.lng != null;

  if (hasLoc) {
    for (const r of rows) {
      r.distance_km =
        r.lat != null && r.lng != null
          ? haversineKm(opts.lat!, opts.lng!, Number(r.lat), Number(r.lng))
          : null;
    }
    let list = rows;
    if (opts.radiusKm != null) {
      list = rows.filter((r) => r.distance_km != null && r.distance_km <= opts.radiusKm!);
    }
    list.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    return list.map(serializeStore);
  }

  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows.map(serializeStore);
}

function serializeBanner(r: any, lang: Lang) {
  return {
    id: r.id,
    title: localizeField(r.title, lang),
    image_url: r.image_url,
    action_type: r.action_type,
    action_value: r.action_value,
    screen: r.screen,
    position: r.position,
    store_id: r.store_id ?? null,
  };
}

export async function getStore(id: string, lang: Lang) {
  const row = await db('stores as s').where({ 's.id': id, 's.is_active': true }).select('s.*').first();
  if (!row) throw ApiError.notFound();
  const [{ count }] = await db('products')
    .where({ store_id: id, is_active: true })
    .count<{ count: string }[]>('id as count');
  const banners = await getStoreBanners(id, lang);
  return { ...serializeStore({ ...row, product_count: count }), banners };
}

/** Approved banners shown on a specific shop's page. */
export async function getStoreBanners(storeId: string, lang: Lang) {
  const rows = await db('banners')
    .where({ is_active: true, status: 'approved', store_id: storeId })
    .orderBy('sort_order', 'asc');
  return rows.map((r) => serializeBanner(r, lang));
}

export async function getBanners(lang: Lang, screen?: string) {
  // Only approved banners are ever shown to customers (vendor home requests stay
  // hidden until admin approves them).
  const q = db('banners').where({ is_active: true, status: 'approved' });
  if (screen) q.andWhere({ screen });
  const rows = await q.orderBy('sort_order', 'asc');
  return rows.map((r) => serializeBanner(r, lang));
}
