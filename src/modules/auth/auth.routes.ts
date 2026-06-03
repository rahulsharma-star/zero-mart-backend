import { Router } from 'express';
import * as ctrl from './auth.controller';
import { validate } from '../../middleware/validate';
import { authRequired } from '../../middleware/auth';
import { asyncHandler } from '../../utils/http';
import { requestOtpSchema, verifyOtpSchema } from './auth.schema';

const router = Router();

router.post('/otp/request', validate({ body: requestOtpSchema }), asyncHandler(ctrl.requestOtp));
router.post('/otp/verify', validate({ body: verifyOtpSchema }), asyncHandler(ctrl.verifyOtp));
router.post('/refresh', asyncHandler(ctrl.refresh));
router.post('/logout', asyncHandler(ctrl.logout));
router.get('/me', authRequired, asyncHandler(ctrl.me));
router.patch('/me', authRequired, asyncHandler(ctrl.updateMe));

export default router;
