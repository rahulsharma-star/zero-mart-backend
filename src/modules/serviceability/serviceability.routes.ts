import { Router } from 'express';
import { db } from '../../config/db';
import { ok, asyncHandler } from '../../utils/http';

const router = Router();

/** Check whether a pincode is currently serviceable. */
router.get(
  '/check',
  asyncHandler(async (req, res) => {
    const pincode = String(req.query.pincode ?? '').trim();
    const area = await db('service_areas').where({ pincode, is_active: true }).first();
    return ok(
      res,
      {
        serviceable: !!area,
        pincode,
        city: area?.city ?? null,
        area_name: area?.area_name ?? null,
      },
      area ? 'common.ok' : 'service.unavailable'
    );
  })
);

export default router;

/** Reusable guard used by the order flow. */
export async function isServiceable(pincode: string): Promise<boolean> {
  const area = await db('service_areas').where({ pincode, is_active: true }).first();
  return !!area;
}
