import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(authRequired);

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  contact_name: z.string().trim().max(120).optional(),
  contact_phone: z.string().trim().max(15).optional(),
  line1: z.string().trim().min(1).max(240),
  line2: z.string().trim().max(240).optional(),
  city: z.string().trim().max(120).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/),
  lat: z.number().optional(),
  lng: z.number().optional(),
  is_default: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db('addresses')
      .where({ user_id: req.user!.sub })
      .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'desc' }]);
    return ok(res, rows);
  })
);

router.post(
  '/',
  validate({ body: addressSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    if (req.body.is_default) {
      await db('addresses').where({ user_id: userId }).update({ is_default: false });
    }
    const [row] = await db('addresses')
      .insert({ ...req.body, user_id: userId })
      .returning('*');
    return ok(res, row, 'common.ok', 201);
  })
);

router.put(
  '/:id',
  validate({ body: addressSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const existing = await db('addresses').where({ id: req.params.id, user_id: userId }).first();
    if (!existing) throw ApiError.notFound();
    if (req.body.is_default) {
      await db('addresses').where({ user_id: userId }).update({ is_default: false });
    }
    const [row] = await db('addresses')
      .where({ id: req.params.id, user_id: userId })
      .update(req.body)
      .returning('*');
    return ok(res, row);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = await db('addresses')
      .where({ id: req.params.id, user_id: req.user!.sub })
      .del();
    if (!deleted) throw ApiError.notFound();
    return ok(res, null);
  })
);

export default router;
