import { db } from '../../config/db';
import { getSetting } from '../../services/settings.service';

export interface Totals {
  subtotal: number;
  delivery_fee: number;
  urgent_fee: number;
  discount: number;
  total: number;
  free_delivery_above: number | null;
  min_order_value: number;
  currency: string;
}

interface PricingConfig {
  base_delivery_fee: number;
  min_order_value: number;
  free_delivery_above: number | null;
  surge_multiplier: number;
  surge_active: boolean;
  promo_discount: number;
  urgent_fee: number;
  currency: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Resolve pricing config for a region, falling back to global app_settings. */
export async function getPricingConfig(regionId?: string | null): Promise<PricingConfig> {
  if (regionId) {
    const row = await db('region_pricing').where({ region_id: regionId, is_active: true }).first();
    const region = await db('regions').where({ id: regionId }).first();
    if (row) {
      return {
        base_delivery_fee: Number(row.base_delivery_fee),
        min_order_value: Number(row.min_order_value),
        free_delivery_above: row.free_delivery_above != null ? Number(row.free_delivery_above) : null,
        surge_multiplier: Number(row.surge_multiplier),
        surge_active: row.surge_active,
        promo_discount: Number(row.promo_discount),
        urgent_fee:
          row.urgent_fee != null
            ? Number(row.urgent_fee)
            : await getSetting<number>('urgent_fee', 30),
        currency: region?.currency ?? 'INR',
      };
    }
  }
  // fallback: legacy app_settings
  return {
    base_delivery_fee: await getSetting<number>('delivery_fee', 20),
    min_order_value: await getSetting<number>('min_order_value', 99),
    free_delivery_above: await getSetting<number>('free_delivery_above', 299),
    surge_multiplier: 1,
    surge_active: false,
    promo_discount: 0,
    urgent_fee: await getSetting<number>('urgent_fee', 30),
    currency: await getSetting<string>('currency', 'INR'),
  };
}

/** Compute order/cart totals for a region. */
export async function computeTotals(
  lines: Array<{ price: number; quantity: number }>,
  regionId?: string | null,
  discount = 0,
  urgent = false
): Promise<Totals> {
  const cfg = await getPricingConfig(regionId);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  let fee = subtotal === 0 ? 0 : cfg.base_delivery_fee;
  if (cfg.free_delivery_above != null && subtotal >= cfg.free_delivery_above) fee = 0;
  if (fee > 0 && cfg.surge_active) fee = round2(fee * cfg.surge_multiplier);
  if (fee > 0) fee = Math.max(0, fee - cfg.promo_discount);

  const urgentFee = urgent && subtotal > 0 ? round2(cfg.urgent_fee) : 0;

  const total = round2(subtotal + fee + urgentFee - discount);
  return {
    subtotal: round2(subtotal),
    delivery_fee: round2(fee),
    urgent_fee: urgentFee,
    discount: round2(discount),
    total,
    free_delivery_above: cfg.free_delivery_above,
    min_order_value: cfg.min_order_value,
    currency: cfg.currency,
  };
}
