import { db } from '../../config/db';
import { Lang } from '../../i18n';
import { ApiError } from '../../utils/ApiError';
import { serializeProduct } from '../catalog/catalog.service';
import { computeTotals as computeRegionTotals } from '../pricing/pricing.service';

/** Resolve the user's region (home region, fallback to default address region). */
export async function resolveUserRegion(userId: string): Promise<string | null> {
  const user = await db('users').where({ id: userId }).first();
  if (user?.region_id) return user.region_id;
  const addr = await db('addresses').where({ user_id: userId, is_default: true }).first();
  if (addr?.region_id) return addr.region_id;
  const any = await db('addresses').where({ user_id: userId }).first();
  return any?.region_id ?? null;
}

export async function getCart(userId: string, lang: Lang) {
  const rows = await db('cart_items as ci')
    .join('products as p', 'p.id', 'ci.product_id')
    .where('ci.user_id', userId)
    .select('ci.id as cart_item_id', 'ci.quantity', 'p.*')
    .orderBy('ci.created_at', 'asc');

  const items = rows.map((r) => ({
    cart_item_id: r.cart_item_id,
    quantity: r.quantity,
    product: serializeProduct(r, lang),
    line_total: Number(r.price) * r.quantity,
  }));

  const regionId = await resolveUserRegion(userId);
  const totals = await computeRegionTotals(
    items.map((i) => ({ price: i.product.price, quantity: i.quantity })),
    regionId
  );
  return { items, totals };
}

export async function addItem(userId: string, productId: string, quantity: number, lang: Lang) {
  const product = await db('products').where({ id: productId, is_active: true }).first();
  if (!product) throw ApiError.notFound();
  if (product.stock <= 0) throw new ApiError(409, 'product.out_of_stock');

  await db('cart_items')
    .insert({ user_id: userId, product_id: productId, quantity })
    .onConflict(['user_id', 'product_id'])
    .merge({ quantity: db.raw('cart_items.quantity + ?', [quantity]), updated_at: db.fn.now() });

  return getCart(userId, lang);
}

export async function setQuantity(userId: string, productId: string, quantity: number, lang: Lang) {
  if (quantity <= 0) {
    await db('cart_items').where({ user_id: userId, product_id: productId }).del();
  } else {
    await db('cart_items')
      .insert({ user_id: userId, product_id: productId, quantity })
      .onConflict(['user_id', 'product_id'])
      .merge({ quantity, updated_at: db.fn.now() });
  }
  return getCart(userId, lang);
}

export async function removeItem(userId: string, productId: string, lang: Lang) {
  await db('cart_items').where({ user_id: userId, product_id: productId }).del();
  return getCart(userId, lang);
}

export async function clearCart(userId: string) {
  await db('cart_items').where({ user_id: userId }).del();
}
