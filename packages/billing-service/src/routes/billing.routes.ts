import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode, requireBusiness, requirePermission,
} from '../shared';
import * as ctrl from '../controllers/billing.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

// Invoices
router.post('/invoices/generate', requirePermission('SUBSCRIPTION_MANAGE'), ctrl.generateInvoice);
router.get('/invoices', requirePermission('PAYMENT_VIEW'), ctrl.listInvoices);
router.get('/invoices/:invoiceId', requirePermission('PAYMENT_VIEW'), ctrl.getInvoice);
router.post('/invoices/:invoiceId/pay', requirePermission('SUBSCRIPTION_MANAGE'), ctrl.markInvoicePaid);

// Payments
router.post('/payments', requirePermission('PAYMENT_CREATE'), ctrl.createPayment);
router.post('/payments/bulk', requirePermission('PAYMENT_CREATE'), ctrl.createBulkPayment);
router.get('/payments', requirePermission('PAYMENT_VIEW'), ctrl.listPayments);
router.get('/outstanding/:partyId', requirePermission('PAYMENT_VIEW'), ctrl.getPartyOutstandingBills);

// Payment receipt upload
router.post(
  '/payments/:paymentId/receipt',
  requirePermission('PAYMENT_CREATE'),
  (req, res, next) => {
    ctrl.receiptUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadReceipt,
);

export { router as billingRoutes };
