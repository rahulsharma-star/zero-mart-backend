import { Router } from 'express';
import { z } from 'zod';
import * as svc from './requests.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authRequired);

const createSchema = z.object({
  request_text: z.string().min(3).max(500),
  pincode: z.string().regex(/^\d{6}$/),
});

router.post('/', validate({ body: createSchema }), asyncHandler(async (req, res) => ok(res, await svc.createRequest(req.user!.sub, req.body), 'request.created', 201)));
router.get('/', asyncHandler(async (req, res) => ok(res, await svc.listRequests(req.user!.sub))));
router.get('/:id', asyncHandler(async (req, res) => ok(res, await svc.getRequest(req.user!.sub, req.params.id))));
router.post(
  '/:id/confirm',
  validate({ body: z.object({ address_id: z.string().uuid(), payment_method: z.enum(['upi', 'card', 'cod']) }) }),
  asyncHandler(async (req, res) => ok(res, await svc.confirmRequest(req.user!.sub, req.params.id, req.body, req.lang)))
);
router.post('/:id/cancel', asyncHandler(async (req, res) => ok(res, await svc.cancelRequest(req.user!.sub, req.params.id))));

export default router;
