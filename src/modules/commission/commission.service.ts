import { db } from '../../config/db';
import { getSetting } from '../../services/settings.service';

/** Resolve commission rate for a store (store override → global default). */
export async function resolveCommissionRate(storeId: string | null): Promise<number> {
  if (storeId) {
    const store = await db('stores').where({ id: storeId }).first();
    if (store?.commission_rate != null) return Number(store.commission_rate);
  }
  const global = await getSetting<number>('default_commission_rate', 10);
  return Number(global);
}

/** Compute platform commission and vendor payout from subtotal. */
export function splitCommission(subtotal: number, ratePercent: number) {
  const platform_commission = Math.round(subtotal * (ratePercent / 100) * 100) / 100;
  const vendor_payout = Math.round((subtotal - platform_commission) * 100) / 100;
  return { platform_commission, vendor_payout, commission_rate: ratePercent };
}
