import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode, requireBusiness,
  validate, updateProfileSchema, createPartySchema, createCutterSchema, createExpenseTypeSchema,
} from '../shared';
import * as ctrl from '../controllers/profile.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);

// Profile (user-scoped)
router.get('/me', ctrl.getProfile);
router.patch('/me', validate(updateProfileSchema), ctrl.updateProfile);

// Avatar upload (multipart/form-data, field name: "avatar")
router.post('/me/avatar', (req, res, next) => {
  ctrl.uploadMiddleware(req, res, (err) => {
    if (err) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    next();
  });
}, ctrl.uploadAvatar);

// Avatar remove
router.delete('/me/avatar', ctrl.removeAvatar);

// Bank accounts
router.post('/bank-accounts', ctrl.addBankAccount);
router.get('/bank-accounts', ctrl.listBankAccounts);
router.delete('/bank-accounts/:accountId', ctrl.deleteBankAccount);

// Business-scoped
router.use(requireBusiness);

// Parties
router.post('/parties', validate(createPartySchema), ctrl.createParty);
router.get('/parties', ctrl.listParties);
router.get('/parties/:partyId', ctrl.getParty);
router.patch('/parties/:partyId', ctrl.updateParty);

// Cutters
router.post('/cutters', validate(createCutterSchema), ctrl.createCutter);
router.get('/cutters', ctrl.listCutters);
router.get('/cutters/:cutterId', ctrl.getCutter);
router.patch('/cutters/:cutterId', ctrl.updateCutter);
router.delete('/cutters/:cutterId', ctrl.deleteCutter);
router.post('/cutters/:cutterId/transactions/mark-all-paid', ctrl.markAllCutterTransactionsPaid);
router.post('/cutters/:cutterId/transactions', ctrl.createCutterTransaction);
router.patch('/cutters/:cutterId/transactions/:transactionId', ctrl.updateCutterTransaction);

// Expense Types
router.post('/expense-types', validate(createExpenseTypeSchema), ctrl.createExpenseType);
router.get('/expense-types', ctrl.listExpenseTypes);

export { router as profileRoutes };
