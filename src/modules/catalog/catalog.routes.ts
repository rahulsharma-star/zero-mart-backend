import { Router } from 'express';
import * as ctrl from './catalog.controller';
import { asyncHandler } from '../../utils/http';
import { authOptional } from '../../middleware/auth';

const router = Router();

// Optional auth so logged-in customers' "preferred shops" filter can apply,
// while the catalog stays public for guests.
router.use(authOptional);

router.get('/home', asyncHandler(ctrl.home));
router.get('/banners', asyncHandler(ctrl.banners));
router.get('/categories', asyncHandler(ctrl.categories));
router.get('/stores', asyncHandler(ctrl.stores));
router.get('/stores/:id', asyncHandler(ctrl.store));
router.get('/products', asyncHandler(ctrl.products));
router.get('/products/:idOrSlug', asyncHandler(ctrl.product));

export default router;
