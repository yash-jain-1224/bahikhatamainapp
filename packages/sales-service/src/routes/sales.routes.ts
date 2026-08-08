import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode, requireBusiness, requirePermission,
  validate, createSaleSchema,
} from '../shared';
import * as ctrl from '../controllers/sales.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

// Sales CRUD
router.post('/', requirePermission('SALE_CREATE'), validate(createSaleSchema), ctrl.createSale);
router.get('/', requirePermission('SALE_VIEW'), ctrl.listSales);
router.get('/dashboard', requirePermission('SALE_VIEW'), ctrl.getSalesDashboard);

// Payment receipt upload — must be before /:saleId
router.post(
  '/payments/receipt-upload',
  requirePermission('SALE_CREATE'),
  (req, res, next) => {
    ctrl.receiptUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadPaymentReceipt,
);

router.get('/:saleId', requirePermission('SALE_VIEW'), ctrl.getSale);
// SALE_EDIT, not SALE_CREATE: the role matrix deliberately gives STAFF
// create-but-not-edit, and this route was letting them modify existing sales.
router.patch('/:saleId', requirePermission('SALE_EDIT'), ctrl.updateSale);
router.delete('/:saleId', requirePermission('SALE_DELETE'), ctrl.deleteSale);

// Attachments (bills / PDFs)
router.post(
  '/:saleId/attachments',
  requirePermission('SALE_CREATE'),
  (req, res, next) => {
    ctrl.attachmentUploadMiddleware(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, message: err.message }); return; }
      next();
    });
  },
  ctrl.uploadAttachment,
);
router.delete('/:saleId/attachments/:attachmentId', requirePermission('SALE_DELETE'), ctrl.deleteAttachment);

// Lots
router.get('/lots/all', requirePermission('SALE_VIEW'), ctrl.listLots);
router.get('/lots/:lotId', requirePermission('SALE_VIEW'), ctrl.getLotDetails);

export { router as salesRoutes };
