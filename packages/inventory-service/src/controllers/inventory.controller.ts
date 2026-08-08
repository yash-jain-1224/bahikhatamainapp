import { Request, Response } from 'express';
import { asyncHandler, createAuditLog , AuthenticatedRequest } from '../shared';
import { inventoryService } from '../services/inventory.service';

// ─── ITEMS ──────────────────────────────────────────────
export const createItem = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const item = await inventoryService.createItem(businessId, req.body);

  await createAuditLog({
    businessId, userId, action: 'ITEM_CREATE', entityType: 'inventory_item',
    entityId: item.id, newData: { name: item.name, sku: item.sku },
  });

  res.status(201).json({ success: true, message: 'Item created', data: item });
});

export const updateItem = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { itemId } = req.params;
  const item = await inventoryService.updateItem(itemId, businessId, req.body);

  await createAuditLog({
    businessId, userId, action: 'ITEM_UPDATE', entityType: 'inventory_item', entityId: itemId,
  });

  res.json({ success: true, message: 'Item updated', data: item });
});

export const getItem = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const item = await inventoryService.getItem(req.params.itemId, businessId);
  res.json({ success: true, data: item });
});

export const listItems = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await inventoryService.listItems(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const getLowStock = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const items = await inventoryService.getLowStockItems(businessId);
  res.json({ success: true, data: items });
});

// ─── CATEGORIES ─────────────────────────────────────────
export const createCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const cat = await inventoryService.createCategory(businessId, req.body);
  res.status(201).json({ success: true, message: 'Category created', data: cat });
});

export const listCategories = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const cats = await inventoryService.listCategories(businessId);
  res.json({ success: true, data: cats });
});

export const updateCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const cat = await inventoryService.updateCategory(req.params.categoryId, businessId, req.body);
  res.json({ success: true, message: 'Category updated', data: cat });
});

// ─── STOCK ADJUSTMENT ────────────────────────────────────
export const adjustStock = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const result = await inventoryService.adjustStock(businessId, userId, req.body);

  await createAuditLog({
    businessId, userId, action: 'STOCK_ADJUSTMENT', entityType: 'inventory_item',
    entityId: req.body.itemId, newData: { type: req.body.type, quantity: req.body.quantity },
  });

  res.json({ success: true, message: 'Stock adjusted', data: result });
});

// ─── TRANSACTIONS ────────────────────────────────────────
export const getTransactions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await inventoryService.getTransactions(businessId, req.query as any);
  res.json({ success: true, ...result });
});

// ─── SEED DEFAULTS ───────────────────────────────────────
export const seedDefaults = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await inventoryService.seedDefaults(businessId);
  res.json({ success: true, message: 'Seed completed', data: result });
});

// ─── PRUNE SEEDED ITEMS ──────────────────────────────────
export const pruneSeededItems = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  // Callers must name the varieties to prune; with no names this deletes nothing.
  const names = Array.isArray(req.body?.names) ? (req.body.names as string[]) : undefined;
  const result = await inventoryService.pruneSeededItems(businessId, names);
  res.json({ success: true, message: 'Prune completed', data: result });
});

// ─── DASHBOARD ───────────────────────────────────────────
export const getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const dashboard = await inventoryService.getInventoryDashboard(businessId);
  res.json({ success: true, data: dashboard });
});
