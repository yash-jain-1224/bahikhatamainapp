import { Router } from 'express';
import { authenticateToken, checkMaintenanceMode, requireBusiness, requireSuperAdmin } from '../shared';
import * as ctrl from '../controllers/notification.controller';

const router = Router();

// WhatsApp webhook (no auth required)
router.get('/whatsapp/webhook', ctrl.whatsappWebhook);
router.post('/whatsapp/webhook', ctrl.whatsappWebhook);

// Authenticated routes
router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);

router.get('/', ctrl.getUserNotifications);
router.patch('/:notificationId/read', ctrl.markAsRead);
router.patch('/read-all', ctrl.markAllAsRead);
router.delete('/:notificationId', ctrl.deleteNotification);

// Fires reminder messages for EVERY business in the database — this is the
// platform-wide scheduled job's entry point (index.ts already runs it on a
// timer), not a tenant action. Super admin only.
router.post('/process-bill-reminders', requireSuperAdmin, ctrl.processBillReminders);

// Business-scoped
router.use(requireBusiness);
router.post('/payment-reminder', ctrl.sendPaymentReminder);
router.post('/low-stock-alerts', ctrl.sendLowStockAlerts);

export { router as notificationRoutes };
