import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode,
  requireBusiness,
  requirePermission,
  validate,
  createPurchaseSchema,
} from '../shared';
import * as ctrl from '../controllers/purchase.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

router.post('/', requirePermission('PURCHASE_CREATE'), validate(createPurchaseSchema), ctrl.createPurchase);
router.get('/', requirePermission('PURCHASE_VIEW'), ctrl.listPurchases);
router.get('/dashboard', requirePermission('PURCHASE_VIEW'), ctrl.getDashboard);

// Payment receipt upload — must be before /:purchaseId
router.post(
  '/payments/receipt-upload',
  requirePermission('PURCHASE_CREATE'),
  (req, res, next) => {
    ctrl.receiptUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadPaymentReceipt,
);

// Expense receipt upload — must be before /:purchaseId
router.post(
  '/expenses/receipt-upload',
  requirePermission('PURCHASE_CREATE'),
  (req, res, next) => {
    ctrl.expenseReceiptUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadExpenseReceipt,
);

router.get('/:purchaseId', requirePermission('PURCHASE_VIEW'), ctrl.getPurchase);
router.patch('/:purchaseId', requirePermission('PURCHASE_CREATE'), ctrl.updatePurchase);
router.delete('/:purchaseId', requirePermission('PURCHASE_DELETE'), ctrl.deletePurchase);

// Attachments (bills / PDFs)
router.post(
  '/:purchaseId/attachments',
  requirePermission('PURCHASE_CREATE'),
  (req, res, next) => {
    ctrl.attachmentUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadAttachment,
);
router.delete('/:purchaseId/attachments/:attachmentId', requirePermission('PURCHASE_DELETE'), ctrl.deleteAttachment);

export { router as purchaseRoutes };
