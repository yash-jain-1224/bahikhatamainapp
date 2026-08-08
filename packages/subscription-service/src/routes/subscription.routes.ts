import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, checkMaintenanceMode, validate, createSubscriptionSchema, AuthenticatedRequest } from '../shared';
import * as ctrl from '../controllers/subscription.controller';

const router = Router();

// Simple guard: user must be authenticated and own at least one business
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  next();
}

// Public routes
router.get('/plans', ctrl.getPlans);
router.post('/webhook/razorpay', ctrl.razorpayWebhook);

// Protected routes — auth only, no business header needed (subscription is user-scoped)
router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);

router.get('/current', ctrl.getCurrentSubscription);
router.post('/', requireAuth, validate(createSubscriptionSchema), ctrl.createSubscription);
router.get('/invoices', ctrl.getInvoices);
router.post('/cancel', requireAuth, ctrl.cancelSubscription);

export { router as subscriptionRoutes };