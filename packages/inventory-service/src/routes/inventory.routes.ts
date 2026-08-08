import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode, requireBusiness, requirePermission,
  validate, createItemSchema, createCategorySchema,
} from '../shared';
import * as ctrl from '../controllers/inventory.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

// Items
router.post('/items', requirePermission('INVENTORY_EDIT'), validate(createItemSchema), ctrl.createItem);
router.get('/items', requirePermission('INVENTORY_VIEW'), ctrl.listItems);
router.get('/items/low-stock', requirePermission('INVENTORY_VIEW'), ctrl.getLowStock);
router.get('/items/:itemId', requirePermission('INVENTORY_VIEW'), ctrl.getItem);
router.patch('/items/:itemId', requirePermission('INVENTORY_EDIT'), ctrl.updateItem);

// Categories
router.post('/categories', requirePermission('INVENTORY_EDIT'), validate(createCategorySchema), ctrl.createCategory);
router.get('/categories', requirePermission('INVENTORY_VIEW'), ctrl.listCategories);
router.patch('/categories/:categoryId', requirePermission('INVENTORY_EDIT'), ctrl.updateCategory);

// Stock Adjustment
router.post('/adjust', requirePermission('INVENTORY_EDIT'), ctrl.adjustStock);

// Transactions
router.get('/transactions', requirePermission('INVENTORY_VIEW'), ctrl.getTransactions);

// Dashboard
router.get('/dashboard', requirePermission('INVENTORY_VIEW'), ctrl.getDashboard);

// Seed defaults (idempotent — safe to call multiple times)
router.post('/seed', requirePermission('INVENTORY_EDIT'), ctrl.seedDefaults);

// Prune old seeded items that have no stock/lots/purchases/sales
router.post('/prune-seeded', requirePermission('INVENTORY_EDIT'), ctrl.pruneSeededItems);

export { router as inventoryRoutes };
