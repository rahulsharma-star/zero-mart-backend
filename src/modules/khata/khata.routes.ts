import { Router } from 'express';
import * as svc from './khata.service';
import { ok, asyncHandler } from '../../utils/http';
import { authRequired } from '../../middleware/auth';

const router = Router();
router.use(authRequired);

// Customer: my khata across shops.
router.get('/', asyncHandler(async (req, res) => ok(res, await svc.listForCustomer(req.user!.sub))));

export default router;
