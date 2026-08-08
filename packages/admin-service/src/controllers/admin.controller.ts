import { Request, Response } from 'express';
import { asyncHandler, createAuditLog , AuthenticatedRequest } from '../shared';
import { adminService } from '../services/admin.service';

// Request metadata for audit entries — without it the Audit Logs IP column is
// empty for every admin event.
const reqMeta = (req: Request) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

// Dashboard
export const getPlatformDashboard = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const dashboard = await adminService.getPlatformDashboard();
  res.json({ success: true, data: dashboard });
});

// Users
export const listUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listUsers(req.query as any);
  res.json({ success: true, ...result });
});

export const getUserDetail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = await adminService.getUserDetail(req.params.userId);
  res.json({ success: true, data: user });
});

export const toggleUserStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const user = await adminService.toggleUserStatus(req.params.userId, req.body.isActive, userId);
  await createAuditLog({ userId, action: 'ADMIN_TOGGLE_USER', entityType: 'user', entityId: req.params.userId, ...reqMeta(req) });
  res.json({ success: true, data: user });
});

export const toggleSuperAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const user = await adminService.toggleSuperAdmin(req.params.userId, req.body.isSuperAdmin, userId);
  await createAuditLog({ userId, action: 'ADMIN_TOGGLE_SUPER_ADMIN', entityType: 'user', entityId: req.params.userId, newData: { isSuperAdmin: req.body.isSuperAdmin }, ...reqMeta(req) });
  res.json({ success: true, data: user });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await adminService.deleteUser(req.params.userId, userId);
  await createAuditLog({ userId, action: 'ADMIN_DELETE_USER', entityType: 'user', entityId: req.params.userId, ...reqMeta(req) });
  res.json({ success: true, message: 'User deleted successfully' });
});

// Create User (Admin)
export const createUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const adminUserId = (req as unknown as AuthenticatedRequest).user?.userId;
  const user = await adminService.createUser(req.body);
  await createAuditLog({ userId: adminUserId, action: 'ADMIN_CREATE_USER', entityType: 'user', entityId: user.id, ...reqMeta(req) });
  res.status(201).json({ success: true, message: 'User created successfully', data: user });
});

// Create Business (Admin)
export const createBusiness = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const adminUserId = (req as unknown as AuthenticatedRequest).user?.userId;
  const business = await adminService.createBusiness(req.body);
  await createAuditLog({ userId: adminUserId, action: 'ADMIN_CREATE_BUSINESS', entityType: 'business', entityId: business.id, ...reqMeta(req) });
  res.status(201).json({ success: true, message: 'Business created successfully', data: business });
});

// Manual Subscription Purchase (Admin)
export const createManualSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const adminUserId = (req as unknown as AuthenticatedRequest).user?.userId;
  const result = await adminService.createManualSubscription(req.body);
  await createAuditLog({
    userId: adminUserId, action: 'ADMIN_MANUAL_SUBSCRIPTION',
    entityType: 'subscription', entityId: result.subscription.id,
    newData: { paymentMode: req.body.paymentMode, amount: req.body.amount },
    ...reqMeta(req),
  });
  res.status(201).json({ success: true, message: 'Subscription purchased successfully', data: result });
});

// Businesses
export const listBusinesses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listBusinesses(req.query as any);
  res.json({ success: true, ...result });
});

export const getBusinessDetail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const business = await adminService.getBusinessDetail(req.params.businessId);
  res.json({ success: true, data: business });
});

export const toggleBusinessStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const business = await adminService.toggleBusinessStatus(req.params.businessId, req.body.isActive);
  await createAuditLog({ userId, action: 'ADMIN_TOGGLE_BUSINESS', entityType: 'business', entityId: req.params.businessId, ...reqMeta(req) });
  res.json({ success: true, data: business });
});

export const deleteBusiness = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await adminService.deleteBusiness(req.params.businessId);
  await createAuditLog({ userId, action: 'ADMIN_DELETE_BUSINESS', entityType: 'business', entityId: req.params.businessId, ...reqMeta(req) });
  res.json({ success: true, message: 'Business deleted successfully' });
});

// Plans
export const listPlans = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const plans = await adminService.listPlans();
  res.json({ success: true, data: plans });
});

export const createPlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const plan = await adminService.createPlan(req.body);
  // Pricing changes are the highest-impact mutation in the console — they
  // must be attributable in the audit log.
  await createAuditLog({ userId, action: 'ADMIN_CREATE_PLAN', entityType: 'plan', entityId: plan.id, newData: req.body, ...reqMeta(req) });
  res.status(201).json({ success: true, message: 'Plan created', data: plan });
});

export const updatePlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const plan = await adminService.updatePlan(req.params.planId, req.body);
  await createAuditLog({ userId, action: 'ADMIN_UPDATE_PLAN', entityType: 'plan', entityId: req.params.planId, newData: req.body, ...reqMeta(req) });
  res.json({ success: true, data: plan });
});

export const deletePlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await adminService.deletePlan(req.params.planId);
  await createAuditLog({ userId, action: 'ADMIN_DELETE_PLAN', entityType: 'plan', entityId: req.params.planId, ...reqMeta(req) });
  res.json({ success: true, message: 'Plan deleted successfully' });
});

// Audit Logs
export const getAuditLogs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.getAuditLogs(req.query as any);
  res.json({ success: true, ...result });
});

// Invoices
export const listInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listInvoices(req.query as any);
  res.json({ success: true, ...result });
});

export const getInvoiceDetail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const invoice = await adminService.getInvoiceDetail(req.params.invoiceId);
  res.json({ success: true, data: invoice });
});

// Feature Flags
export const getFeatureFlags = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.query.businessId as string | undefined;
  const flags = await adminService.getFeatureFlags(businessId);
  res.json({ success: true, data: flags });
});

export const toggleFeatureFlag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const flag = await adminService.toggleFeatureFlag(req.params.flagId, req.body.isEnabled);
  await createAuditLog({ userId, action: 'ADMIN_TOGGLE_FEATURE_FLAG', entityType: 'feature_flag', entityId: req.params.flagId, newData: { isEnabled: req.body.isEnabled }, ...reqMeta(req) });
  res.json({ success: true, data: flag });
});

export const createFeatureFlag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const flag = await adminService.createFeatureFlag(req.body);
  await createAuditLog({ userId, action: 'ADMIN_CREATE_FEATURE_FLAG', entityType: 'feature_flag', entityId: flag.id, newData: req.body, ...reqMeta(req) });
  res.status(201).json({ success: true, data: flag });
});

export const listSubscriptions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listSubscriptions(req.query as Record<string, any>);
  res.json({ success: true, ...result });
});

// Analytics
export const getSubscriptionAnalytics = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const analytics = await adminService.getSubscriptionAnalytics();
  res.json({ success: true, data: analytics });
});

// Platform Settings
export const getSettings = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const settings = await adminService.getSettings();
  res.json({ success: true, data: settings });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const settings = await adminService.updateSettings(req.body);
  await createAuditLog({ userId, action: 'ADMIN_UPDATE_SETTINGS', entityType: 'settings', entityId: 'platform', ...reqMeta(req) });
  res.json({ success: true, data: settings, message: 'Settings saved successfully' });
});
