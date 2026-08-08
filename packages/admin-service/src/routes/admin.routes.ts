import { Router } from 'express';
import { authenticateToken, requireSuperAdmin } from '../shared';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

// Dashboard
router.get('/dashboard', ctrl.getPlatformDashboard);

// Users
router.get('/users', ctrl.listUsers);
router.post('/users', ctrl.createUser);
router.get('/users/:userId', ctrl.getUserDetail);
router.patch('/users/:userId/status', ctrl.toggleUserStatus);
router.patch('/users/:userId/admin', ctrl.toggleSuperAdmin);
router.delete('/users/:userId', ctrl.deleteUser);

// Businesses
router.get('/businesses', ctrl.listBusinesses);
router.post('/businesses', ctrl.createBusiness);
router.get('/businesses/:businessId', ctrl.getBusinessDetail);
router.patch('/businesses/:businessId/status', ctrl.toggleBusinessStatus);
router.delete('/businesses/:businessId', ctrl.deleteBusiness);

// Subscriptions
// The list route must be registered BEFORE '/subscriptions/manual' is matched
// as a param anywhere; it is a distinct literal path, so order is safe, but
// keep them together so that stays obvious.
router.get('/subscriptions', ctrl.listSubscriptions);

// Manual Subscription (cash/offline payments)
router.post('/subscriptions/manual', ctrl.createManualSubscription);

// Invoices
router.get('/invoices', ctrl.listInvoices);
router.get('/invoices/:invoiceId', ctrl.getInvoiceDetail);

// Plans
router.get('/plans', ctrl.listPlans);
router.post('/plans', ctrl.createPlan);
router.patch('/plans/:planId', ctrl.updatePlan);
router.delete('/plans/:planId', ctrl.deletePlan);

// Audit Logs
router.get('/audit-logs', ctrl.getAuditLogs);

// Feature Flags
router.get('/feature-flags', ctrl.getFeatureFlags);
router.post('/feature-flags', ctrl.createFeatureFlag);
router.patch('/feature-flags/:flagId', ctrl.toggleFeatureFlag);

// Analytics
router.get('/analytics/subscriptions', ctrl.getSubscriptionAnalytics);

// Platform Settings
router.get('/settings', ctrl.getSettings);
router.put('/settings', ctrl.updateSettings);

export { router as adminRoutes };
