import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger,
  parsePagination, getPaginationOffset, buildPaginationMeta,
  NotFoundError, BadRequestError,
  getPrismaClient,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('inventory-service');

export class InventoryService {
  // ─── ITEMS ──────────────────────────────────────────────────
  async createItem(businessId: string, data: {
    name: string; sku?: string; categoryId?: string;
    unit?: string; minStock?: number; hsnCode?: string; gstRate?: number;
    openingStock?: number;
  }) {
    // Opening stock was previously accepted by the UI but never persisted, so
    // every new item started at current_stock = 0.
    const openingStock = Number(data.openingStock) || 0;

    const item = await prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        category_id: data.categoryId,
        name: data.name,
        sku: data.sku,
        unit: data.unit || 'KG',
        min_stock: new Prisma.Decimal(data.minStock || 0),
        hsn_code: data.hsnCode,
        gst_rate: new Prisma.Decimal(data.gstRate || 0),
        current_stock: new Prisma.Decimal(openingStock),
        quantity_in: new Prisma.Decimal(openingStock),
      },
      include: { category: true },
    });
    logger.info('Item created', { itemId: item.id, businessId, openingStock });
    return item;
  }

  async updateItem(itemId: string, businessId: string, data: Partial<{
    name: string; sku: string; categoryId: string;
    unit: string; minStock: number; hsnCode: string; gstRate: number; isActive: boolean;
  }>) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, business_id: businessId },
    });
    if (!item) throw new NotFoundError('Item');

    return prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.categoryId && { category_id: data.categoryId }),
        ...(data.unit && { unit: data.unit }),
        ...(data.minStock !== undefined && { min_stock: new Prisma.Decimal(data.minStock) }),
        ...(data.hsnCode !== undefined && { hsn_code: data.hsnCode }),
        ...(data.gstRate !== undefined && { gst_rate: new Prisma.Decimal(data.gstRate) }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
      include: { category: true },
    });
  }

  async getItem(itemId: string, businessId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, business_id: businessId },
      include: {
        category: true,
        lots: { where: { status: { in: ['AVAILABLE', 'PARTIAL'] } }, orderBy: { created_at: 'desc' } },
        inventory_txns: { orderBy: { created_at: 'desc' }, take: 20 },
      },
    });
    if (!item) throw new NotFoundError('Item');
    return item;
  }

  async listItems(businessId: string, query: Record<string, any>) {
    const { page, limit, sortBy, sortOrder } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where.category_id = query.categoryId;
    // Allow category filter by name (from frontend)
    if (query.category) {
      where.category = { name: { equals: query.category, mode: 'insensitive' } };
    }
    if (query.isActive !== undefined) {
      where.is_active = query.isActive === 'true';
    } else if (query.includeInactive !== 'true') {
      // Deactivated ("deleted") items are hidden by default — otherwise
      // deactivating an item leaves it sitting in the list as though the
      // delete had failed. Pass includeInactive=true to see them.
      where.is_active = true;
    }
    if (query.lowStock === 'true') {
      // Comparing two columns needs Prisma's field-reference API. This used to
      // pass `prisma.$queryRaw`"min_stock"`` — a Promise, not a column
      // reference — which Prisma rejects, so ?lowStock=true could only error.
      // `min_stock > 0` matches the definition the dashboard's low-stock count
      // uses; without it every item with no reorder level set and zero stock
      // counts as low, and the two screens report different numbers.
      where.current_stock = { lte: prisma.inventoryItem.fields.min_stock };
      where.min_stock = { gt: 0 };
    }
    // Stock range
    const stockMin = query.stock_min !== undefined ? Number(query.stock_min) : undefined;
    const stockMax = query.stock_max !== undefined ? Number(query.stock_max) : undefined;
    if (stockMin !== undefined || stockMax !== undefined) {
      where.current_stock = where.current_stock || {};
      if (stockMin !== undefined && !Number.isNaN(stockMin)) where.current_stock.gte = stockMin;
      if (stockMax !== undefined && !Number.isNaN(stockMax)) where.current_stock.lte = stockMax;
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: { category: true },
        orderBy: { [sortBy || 'created_at']: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    // Compute average purchase rate from active lots for each item
    const itemIds = items.map((i: any) => i.id);
    const avgRates: Record<string, number> = {};
    if (itemIds.length > 0) {
      const lots = await prisma.lot.groupBy({
        by: ['item_id'],
        where: {
          item_id: { in: itemIds },
          status: { in: ['AVAILABLE', 'PARTIAL'] },
        },
        _avg: { purchase_rate: true },
      });
      for (const l of lots) {
        avgRates[l.item_id] = l._avg.purchase_rate ? Number(l._avg.purchase_rate) : 0;
      }
    }

    const enriched = items.map((i: any) => ({
      ...i,
      avg_purchase_rate: avgRates[i.id] ?? null,
    }));

    return { data: enriched, meta: buildPaginationMeta(total, page, limit) };
  }

  async getLowStockItems(businessId: string) {
    const items = await prisma.$queryRaw`
      SELECT * FROM inventory_items 
      WHERE business_id = ${businessId} 
        AND is_active = true 
        AND current_stock <= min_stock 
        AND min_stock > 0
      ORDER BY current_stock ASC
    `;
    return items;
  }

  // ─── CATEGORIES ─────────────────────────────────────────────
  async createCategory(businessId: string, data: { name: string; description?: string; parentId?: string }) {
    return prisma.category.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        name: data.name,
        description: data.description,
        parent_id: data.parentId,
      },
      include: { children: true },
    });
  }

  async listCategories(businessId: string) {
    return prisma.category.findMany({
      where: { business_id: businessId, is_active: true },
      include: { children: true, items: { select: { id: true, name: true, current_stock: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateCategory(categoryId: string, businessId: string, data: Partial<{
    name: string; description: string; parentId: string; isActive: boolean;
  }>) {
    const cat = await prisma.category.findFirst({ where: { id: categoryId, business_id: businessId } });
    if (!cat) throw new NotFoundError('Category');

    return prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.parentId !== undefined && { parent_id: data.parentId }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
    });
  }

  // ─── STOCK ADJUSTMENT ──────────────────────────────────────
  async adjustStock(businessId: string, _userId: string, data: {
    itemId: string; quantity: number; reason: string; type: 'ADD' | 'REMOVE'; notes?: string;
  }) {
    return prisma.$transaction(async (tx: any) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: data.itemId, business_id: businessId },
      });
      if (!item) throw new NotFoundError('Item');

      const currentStock = Number(item.current_stock);
      let newStock: number;

      if (data.type === 'ADD') {
        newStock = currentStock + data.quantity;
        await tx.inventoryItem.update({
          where: { id: data.itemId },
          data: {
            quantity_in: new Prisma.Decimal(Number(item.quantity_in) + data.quantity),
            current_stock: new Prisma.Decimal(newStock),
          },
        });
      } else {
        if (currentStock < data.quantity) {
          throw new BadRequestError(`Insufficient stock. Current: ${currentStock}, Removing: ${data.quantity}`);
        }
        newStock = currentStock - data.quantity;
        await tx.inventoryItem.update({
          where: { id: data.itemId },
          data: {
            quantity_out: new Prisma.Decimal(Number(item.quantity_out) + data.quantity),
            current_stock: new Prisma.Decimal(newStock),
          },
        });
      }

      const txn = await tx.inventoryTransaction.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          item_id: data.itemId,
          txn_type: 'ADJUSTMENT',
          reference_type: 'adjustment',
          reference_id: uuidv4(),
          quantity: new Prisma.Decimal(data.type === 'ADD' ? data.quantity : -data.quantity),
          balance_after: new Prisma.Decimal(newStock),
          notes: [data.reason, data.notes].filter(Boolean).join(' — '),
        },
      });

      logger.info('Stock adjusted', { itemId: data.itemId, type: data.type, quantity: data.quantity, newStock });
      return { item: { ...item, current_stock: newStock }, transaction: txn };
    });
  }

  // ─── TRANSACTIONS ──────────────────────────────────────────
  async getTransactions(businessId: string, query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId };
    if (query.itemId) where.item_id = query.itemId;
    if (query.txnType) where.txn_type = query.txnType;

    const [txns, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        include: { item: { select: { id: true, name: true, unit: true } } },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    return { data: txns, meta: buildPaginationMeta(total, page, limit) };
  }

  // ─── PRUNE SEEDED ITEMS ────────────────────────────────
  // Cleanup helper for removing *legacy auto-seeded* item varieties.
  //
  // This used to select "every zero-stock item NOT named Marble/Granite". That
  // inverted its intent: seedDefaults() now creates ONLY 'Marble' and
  // 'Granite', so the exclusion matched nothing but the user's OWN catalogue
  // entries — and since createItem never persisted opening stock, every
  // freshly created item had current_stock = 0 and was therefore eligible.
  // The result was silent, unrecoverable loss of user-created items.
  //
  // It is now explicit: callers must name the varieties to remove. With no
  // names supplied it deletes nothing.
  async pruneSeededItems(businessId: string, names?: string[]) {
    const targetNames = (names || []).map(n => n.trim()).filter(Boolean);

    if (targetNames.length === 0) {
      logger.info('Prune skipped — no item names supplied', { businessId });
      return { deleted: 0, skipped: true };
    }

    // Never allow the generic seeded categories themselves to be pruned.
    const KEEP = ['marble', 'granite'];
    const prunable = targetNames.filter(n => !KEEP.includes(n.toLowerCase()));

    const candidates = await prisma.inventoryItem.findMany({
      where: {
        business_id: businessId,
        current_stock: 0,
        quantity_in: 0,
        name: { in: prunable, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        _count: { select: { lots: true, purchase_items: true, sale_items: true } },
      },
    });

    // Only delete items that have no associated lots / purchases / sales
    const toDelete = candidates
      .filter(i => i._count.lots === 0 && i._count.purchase_items === 0 && i._count.sale_items === 0)
      .map(i => i.id);

    if (toDelete.length > 0) {
      await prisma.inventoryItem.deleteMany({ where: { id: { in: toDelete } } });
    }

    logger.info('Pruned seeded items', { businessId, requested: prunable.length, deleted: toDelete.length });
    return { deleted: toDelete.length };
  }

  // ─── SEED DEFAULTS ─────────────────────────────────────
  async seedDefaults(businessId: string) {
    const DEFAULT_SEEDS: { category: string; items: string[] }[] = [
      {
        category: 'Marble',
        items: [
          // Generic only — users can add specific varieties themselves
          'Marble',
        ],
      },
      {
        category: 'Granite',
        items: [
          // Generic only — users can add specific varieties themselves
          'Granite',
        ],
      },
    ];

    const created = { categories: 0, items: 0, repaired: 0 };

    for (const seed of DEFAULT_SEEDS) {
      // Find ALL categories with this name (may have duplicates)
      const allCats = await prisma.category.findMany({
        where: { business_id: businessId, name: { equals: seed.category, mode: 'insensitive' } },
        orderBy: { created_at: 'asc' },
      });

      let cat: typeof allCats[0];
      if (allCats.length === 0) {
        cat = await prisma.category.create({
          data: { id: uuidv4(), business_id: businessId, name: seed.category },
        });
        created.categories++;
      } else {
        // Keep the first, merge items from duplicates into the keeper, then delete duplicates
        cat = allCats[0];
        const dupIds = allCats.slice(1).map(c => c.id);
        if (dupIds.length > 0) {
          // Re-assign all items from duplicate categories to the keeper
          await prisma.inventoryItem.updateMany({
            where: { category_id: { in: dupIds } },
            data: { category_id: cat.id },
          });
          await prisma.category.deleteMany({ where: { id: { in: dupIds } } });
          created.repaired += dupIds.length;
        }
      }

      for (const itemName of seed.items) {
        // Find ALL items with this name for this business (duplicates may exist)
        const allMatches = await prisma.inventoryItem.findMany({
          where: { business_id: businessId, name: { equals: itemName, mode: 'insensitive' } },
          orderBy: { created_at: 'asc' },
        });

        if (allMatches.length === 0) {
          // Create fresh
          await prisma.inventoryItem.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              category_id: cat.id,
              name: itemName,
              unit: 'SFT',
              min_stock: new Prisma.Decimal(0),
              gst_rate: new Prisma.Decimal(0),
            },
          });
          created.items++;
        } else {
          // Keep the one with a category (or the first one), delete the rest
          const keeper = allMatches.find(i => i.category_id) || allMatches[0];
          const dupes = allMatches.filter(i => i.id !== keeper.id);
          if (dupes.length > 0) {
            await prisma.inventoryItem.deleteMany({ where: { id: { in: dupes.map(d => d.id) } } });
            created.repaired += dupes.length;
          }
          // Ensure keeper has the correct category
          if (!keeper.category_id) {
            await prisma.inventoryItem.update({
              where: { id: keeper.id },
              data: { category_id: cat.id },
            });
            created.repaired++;
          }
        }
      }
    }

    logger.info('Seed defaults completed', { businessId, ...created });
    return created;
  }

  // ─── DASHBOARD ─────────────────────────────────────────────
  async getInventoryDashboard(businessId: string) {
    const [totalItems, totalValue, lowStockCount, categoryBreakdown] = await Promise.all([
      prisma.inventoryItem.count({ where: { business_id: businessId, is_active: true } }),
      prisma.$queryRaw<[{ total: number }]>`
        SELECT COALESCE(SUM(current_stock * COALESCE(
          (SELECT purchase_rate FROM lots WHERE item_id = inventory_items.id ORDER BY created_at DESC LIMIT 1), 0
        )), 0) as total
        FROM inventory_items WHERE business_id = ${businessId} AND is_active = true
      `,
      prisma.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM inventory_items 
        WHERE business_id = ${businessId} AND is_active = true AND current_stock <= min_stock AND min_stock > 0
      `,
      prisma.category.findMany({
        where: { business_id: businessId, is_active: true },
        include: { _count: { select: { items: true } } },
      }),
    ]);

    return {
      totalItems,
      totalValue: totalValue?.[0]?.total || 0,
      lowStockCount: lowStockCount?.[0]?.count || 0,
      categoryBreakdown: categoryBreakdown.map(c => ({
        categoryId: c.id,
        categoryName: c.name,
        itemCount: c._count.items,
      })),
    };
  }
}

export const inventoryService = new InventoryService();
