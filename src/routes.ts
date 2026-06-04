import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import catalogRoutes from './modules/catalog/catalog.routes';
import cartRoutes from './modules/cart/cart.routes';
import orderRoutes from './modules/orders/orders.routes';
import addressRoutes from './modules/addresses/addresses.routes';
import serviceabilityRoutes from './modules/serviceability/serviceability.routes';
import paymentRoutes from './modules/payments/payments.routes';
import adminRoutes from './modules/admin/admin.routes';
import deliveryRoutes from './modules/delivery/delivery.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import uploadRoutes from './modules/uploads/uploads.routes';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));

router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/addresses', addressRoutes);
router.use('/serviceability', serviceabilityRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/uploads', uploadRoutes);

export default router;
