import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode,
  requireBusiness,
  requirePermission,
  validate,
  createBusinessSchema,
  updateBusinessSchema,
  createShopSchema,
  inviteUserSchema,
} from '../shared';
import * as ctrl from '../controllers/business.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);

// Business CRUD
router.post('/', ctrl.logoUploadMiddleware, validate(createBusinessSchema), ctrl.createBusiness);
router.get('/', ctrl.getUserBusinesses);         // Frontend calls GET /business (list)
router.get('/my', ctrl.getUserBusinesses);        // Legacy alias
router.get('/dashboard', requireBusiness, ctrl.getDashboardFromHeader); // GET /business/dashboard (business from header)
router.get('/:businessId', requireBusiness, ctrl.getBusiness);
router.put('/:businessId', requireBusiness, requirePermission('BUSINESS_EDIT'), validate(updateBusinessSchema), ctrl.updateBusiness);
router.patch('/:businessId', requireBusiness, requirePermission('BUSINESS_EDIT'), validate(updateBusinessSchema), ctrl.updateBusiness);

// Logo upload / remove
router.patch('/:businessId/logo', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.logoUploadMiddleware, ctrl.uploadLogo);
router.delete('/:businessId/logo', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.removeLogo);

// Dashboard (param-based, legacy)
router.get('/:businessId/dashboard', requireBusiness, requirePermission('PURCHASE_VIEW'), ctrl.getDashboard);

// Shops
router.post('/:businessId/shops', requireBusiness, requirePermission('BUSINESS_EDIT'), validate(createShopSchema), ctrl.createShop);

// Bank Accounts
router.get('/:businessId/bank-accounts', requireBusiness, ctrl.listBankAccounts);
router.post('/:businessId/bank-accounts', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.createBankAccount);
router.patch('/:businessId/bank-accounts/:accountId', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.updateBankAccount);
router.delete('/:businessId/bank-accounts/:accountId', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.deleteBankAccount);

// Bank Statement Upload & Reconciliation
router.post('/:businessId/bank-statements/parse', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.uploadStatement);
router.post('/:businessId/bank-statements/match', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.findStatementMatches);
router.post('/:businessId/bank-statements/reconcile', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.reconcileEntry);

// Credit Cards
router.get('/:businessId/credit-cards', requireBusiness, ctrl.listCreditCards);
router.get('/:businessId/credit-cards/:cardId', requireBusiness, ctrl.getCreditCard);
router.post('/:businessId/credit-cards', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.createCreditCard);
router.patch('/:businessId/credit-cards/:cardId', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.updateCreditCard);
router.delete('/:businessId/credit-cards/:cardId', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.deleteCreditCard);

// Credit Card Statement Upload & Reconciliation
router.post('/:businessId/credit-card-statements/parse', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.uploadCreditCardStatement);
router.post('/:businessId/credit-card-statements/match', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.findCreditCardMatches);
router.post('/:businessId/credit-cards/:cardId/reconcile', requireBusiness, requirePermission('BUSINESS_EDIT'), ctrl.reconcileCreditCardEntry);

// Team
router.post('/:businessId/invite', requireBusiness, requirePermission('USER_INVITE'), validate(inviteUserSchema), ctrl.inviteUser);

export { router as businessRoutes };
