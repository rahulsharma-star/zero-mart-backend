import { Router } from 'express';
import * as ctrl from './catalog.controller';
import { asyncHandler } from '../../utils/http';

const router = Router();

router.get('/home', asyncHandler(ctrl.home));
router.get('/banners', asyncHandler(ctrl.banners));
router.get('/categories', asyncHandler(ctrl.categories));
router.get('/products', asyncHandler(ctrl.products));
router.get('/products/:idOrSlug', asyncHandler(ctrl.product));

export default router;
