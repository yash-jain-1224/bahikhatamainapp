import { Router } from 'express';
import { authenticateToken, checkMaintenanceMode, requireBusiness, requirePermission } from '../shared';
import * as ctrl from '../controllers/ledger.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

// Ledger
router.get('/entries', requirePermission('LEDGER_VIEW'), ctrl.getBusinessLedger);
router.post('/entries', requirePermission('LEDGER_EDIT'), ctrl.createManualEntry);
// Bulk delete of manual entries. The UI's "Delete selected" had no endpoint to
// call and simply reported success.
router.delete('/entries', requirePermission('LEDGER_EDIT'), ctrl.deleteEntries);
router.get('/party/:partyId', requirePermission('LEDGER_VIEW'), ctrl.getPartyLedger);
router.get('/party/:partyId/statement', requirePermission('LEDGER_VIEW'), ctrl.getPartyStatement);

// Reports
router.get('/trial-balance', requirePermission('REPORT_VIEW'), ctrl.getTrialBalance);
router.get('/profit-loss', requirePermission('REPORT_VIEW'), ctrl.getProfitAndLoss);
router.get('/balance-sheet', requirePermission('REPORT_VIEW'), ctrl.getBalanceSheet);
router.get('/outstanding', requirePermission('LEDGER_VIEW'), ctrl.getOutstanding);
router.get('/day-book', requirePermission('LEDGER_VIEW'), ctrl.getDayBook);

export { router as ledgerRoutes };
