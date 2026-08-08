import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, getPrismaClient, NotFoundError } from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('expense-service');

export class ExpenseService {
  /**
   * Create a standalone expense
   */
  async createExpense(businessId: string, data: {
    expenseTypeId: string;
    expenseCategory: 'DIRECT' | 'INDIRECT';
    amount: number;
    expenseDate?: string;
    paymentMode?: string;
    isPaid?: boolean;
    receiptUrl?: string;
    notes?: string;
  }) {
    const expense = await prisma.expense.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        expense_type_id: data.expenseTypeId,
        expense_category: data.expenseCategory,
        amount: new Prisma.Decimal(data.amount),
        expense_date: data.expenseDate ? new Date(data.expenseDate) : new Date(),
        payment_mode: data.paymentMode || null,
        is_paid: data.isPaid !== undefined ? data.isPaid : true,
        receipt_url: data.receiptUrl || null,
        notes: data.notes || null,
      },
      include: {
        expense_type: true,
      },
    });

    logger.info('Standalone expense created', { expenseId: expense.id, businessId, amount: data.amount });
    return expense;
  }

  /**
   * Get unified expense list (standalone + purchase + sale)
   */
  async listAllExpenses(businessId: string, filters: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    date_from?: string;
    date_to?: string;
    expenseTypeId?: string;
    expense_type_id?: string;
    category?: string;
    isPaid?: string;
    is_paid?: string;
    amount_min?: string | number;
    amount_max?: string | number;
    amountMin?: string | number;
    amountMax?: string | number;
    search?: string;
    type?: 'standalone' | 'purchase' | 'sale' | '__all__';
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;

    // The AdvancedFilters component sends the literal string '__all__' for
    // "All" select options and '' for cleared inputs — both mean "no filter".
    // Normalize every filter once here so a sentinel never reaches a Prisma
    // column (Category=All used to throw a PrismaClientValidationError → 500).
    const norm = (v: unknown): string | undefined => {
      if (v === undefined || v === null) return undefined;
      const s = String(v);
      return s === '' || s === '__all__' ? undefined : s;
    };

    const startDate = norm(filters.startDate) || norm(filters.date_from);
    const endDate = norm(filters.endDate) || norm(filters.date_to);
    const expenseTypeId = norm(filters.expenseTypeId) || norm(filters.expense_type_id);
    const category = norm(filters.category);
    const isPaidFilter = norm(filters.isPaid) || norm(filters.is_paid);
    const isPaidValue = isPaidFilter !== undefined ? isPaidFilter === 'true' : undefined;
    const search = norm(filters.search);
    const type = norm(filters.type) || '__all__';

    // Amount range (accept both frontend snake_case and camelCase keys,
    // mirroring the startDate/date_from dual vocabulary above)
    const amountMinRaw = norm(filters.amount_min) ?? norm(filters.amountMin);
    const amountMaxRaw = norm(filters.amount_max) ?? norm(filters.amountMax);
    const amountWhere: any = {};
    if (amountMinRaw !== undefined && !Number.isNaN(Number(amountMinRaw))) amountWhere.gte = Number(amountMinRaw);
    if (amountMaxRaw !== undefined && !Number.isNaN(Number(amountMaxRaw))) amountWhere.lte = Number(amountMaxRaw);

    // Build date filter
    const dateWhere: any = {};
    if (startDate || endDate) {
      if (startDate) dateWhere.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateWhere.lte = end;
      }
    }

    const expenses: any[] = [];
    let total = 0;

    // Merged pagination across three sources: each included source is fetched
    // with skip 0 / take page*limit, the union is sorted by date, and the
    // requested page is sliced out. Tradeoff: page N re-reads up to N*limit
    // rows per source, which is acceptable at UI paging depths and keeps every
    // page reachable. meta.total comes from real count() queries per source.
    const fetchTake = page * limit;

    // 1. Fetch standalone expenses
    if (type === '__all__' || type === 'standalone') {
      const where: any = { business_id: businessId };
      if (Object.keys(dateWhere).length > 0) where.expense_date = dateWhere;
      if (expenseTypeId) where.expense_type_id = expenseTypeId;
      if (category) where.expense_category = category;
      if (isPaidValue !== undefined) where.is_paid = isPaidValue;
      if (Object.keys(amountWhere).length > 0) where.amount = amountWhere;
      if (search) {
        where.OR = [
          { notes: { contains: search, mode: 'insensitive' } },
          { expense_type: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [standalone, standaloneCount] = await Promise.all([
        prisma.expense.findMany({
          where,
          include: { expense_type: true },
          orderBy: { expense_date: 'desc' },
          skip: 0,
          take: fetchTake,
        }),
        prisma.expense.count({ where }),
      ]);
      total += standaloneCount;

      expenses.push(...standalone.map((e: any) => ({
        ...e,
        source: 'standalone',
        source_id: e.id,
        source_number: null,
        expense_date: e.expense_date,
      })));
    }

    // 2. Fetch purchase expenses
    if (type === '__all__' || type === 'purchase') {
      const where: any = {
        purchase: {
          business_id: businessId,
          status: { not: 'CANCELLED' },
          ...(Object.keys(dateWhere).length > 0 ? { purchase_date: dateWhere } : {}),
        },
      };
      if (expenseTypeId) where.expense_type_id = expenseTypeId;
      if (category) where.expense_category = category;
      if (isPaidValue !== undefined) where.is_paid = isPaidValue;
      if (Object.keys(amountWhere).length > 0) where.amount = amountWhere;
      if (search) {
        where.OR = [
          { notes: { contains: search, mode: 'insensitive' } },
          { expense_type: { name: { contains: search, mode: 'insensitive' } } },
          { purchase: { purchase_number: { contains: search, mode: 'insensitive' } } },
          { purchase: { party: { name: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const [purchaseExpenses, purchaseCount] = await Promise.all([
        prisma.purchaseExpense.findMany({
          where,
          include: {
            expense_type: true,
            purchase: { select: { id: true, purchase_number: true, purchase_date: true, party: { select: { name: true } } } },
          },
          orderBy: { created_at: 'desc' },
          skip: 0,
          take: fetchTake,
        }),
        prisma.purchaseExpense.count({ where }),
      ]);
      total += purchaseCount;

      expenses.push(...purchaseExpenses.map((e: any) => ({
        id: e.id,
        business_id: businessId,
        expense_type_id: e.expense_type_id,
        expense_category: e.expense_category,
        amount: e.amount,
        is_paid: e.is_paid,
        receipt_url: e.receipt_url,
        notes: e.notes,
        created_at: e.created_at,
        updated_at: e.updated_at,
        expense_type: e.expense_type,
        expense_date: e.purchase.purchase_date,
        source: 'purchase',
        source_id: e.purchase.id,
        source_number: e.purchase.purchase_number,
        party_name: e.purchase.party?.name,
      })));
    }

    // 3. Fetch sale expenses.
    // SaleExpense has no is_paid column, so its payment status is unknown —
    // when a payment-status filter is applied, sale-sourced expenses are
    // excluded entirely instead of pretending they are paid.
    if ((type === '__all__' || type === 'sale') && isPaidValue === undefined) {
      const where: any = {
        sale: {
          business_id: businessId,
          status: { not: 'CANCELLED' },
          ...(Object.keys(dateWhere).length > 0 ? { sale_date: dateWhere } : {}),
        },
      };
      if (expenseTypeId) where.expense_type_id = expenseTypeId;
      if (category) where.expense_category = category;
      if (Object.keys(amountWhere).length > 0) where.amount = amountWhere;
      if (search) {
        where.OR = [
          { notes: { contains: search, mode: 'insensitive' } },
          { expense_type: { name: { contains: search, mode: 'insensitive' } } },
          { sale: { sale_number: { contains: search, mode: 'insensitive' } } },
          { sale: { party: { name: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const [saleExpenses, saleCount] = await Promise.all([
        prisma.saleExpense.findMany({
          where,
          include: {
            expense_type: true,
            sale: { select: { id: true, sale_number: true, sale_date: true, party: { select: { name: true } } } },
          },
          orderBy: { created_at: 'desc' },
          skip: 0,
          take: fetchTake,
        }),
        prisma.saleExpense.count({ where }),
      ]);
      total += saleCount;

      expenses.push(...saleExpenses.map((e: any) => ({
        id: e.id,
        business_id: businessId,
        expense_type_id: e.expense_type_id,
        expense_category: e.expense_category,
        amount: e.amount,
        is_paid: null, // SaleExpense has no is_paid column — status unknown, not "Paid"
        receipt_url: null,
        notes: e.notes,
        created_at: e.created_at,
        updated_at: e.updated_at,
        expense_type: e.expense_type,
        expense_date: e.sale.sale_date,
        source: 'sale',
        source_id: e.sale.id,
        source_number: e.sale.sale_number,
        party_name: e.sale.party?.name,
      })));
    }

    // Sort all expenses by date descending, then slice out the requested page
    expenses.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());

    const totalPages = Math.ceil(total / limit);

    return {
      data: expenses.slice((page - 1) * limit, page * limit),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get expense by ID (standalone)
   */
  async getExpenseById(expenseId: string, businessId: string) {
    return prisma.expense.findFirst({
      where: { id: expenseId, business_id: businessId },
      include: { expense_type: true },
    });
  }

  /**
   * Update standalone expense
   */
  async updateExpense(expenseId: string, businessId: string, data: {
    expenseTypeId?: string;
    expenseCategory?: 'DIRECT' | 'INDIRECT';
    amount?: number;
    expenseDate?: string;
    paymentMode?: string;
    isPaid?: boolean;
    receiptUrl?: string;
    notes?: string;
  }) {
    const existing = await prisma.expense.findFirst({ where: { id: expenseId, business_id: businessId } });
    if (!existing) throw new NotFoundError('Expense');

    return prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(data.expenseTypeId ? { expense_type_id: data.expenseTypeId } : {}),
        ...(data.expenseCategory ? { expense_category: data.expenseCategory } : {}),
        ...(data.amount !== undefined ? { amount: new Prisma.Decimal(data.amount) } : {}),
        ...(data.expenseDate ? { expense_date: new Date(data.expenseDate) } : {}),
        ...(data.paymentMode !== undefined ? { payment_mode: data.paymentMode || null } : {}),
        ...(data.isPaid !== undefined ? { is_paid: data.isPaid } : {}),
        ...(data.receiptUrl !== undefined ? { receipt_url: data.receiptUrl || null } : {}),
        notes: data.notes ?? existing.notes,
      },
      include: { expense_type: true },
    });
  }

  /**
   * Delete standalone expense
   */
  async deleteExpense(expenseId: string, businessId: string) {
    const existing = await prisma.expense.findFirst({ where: { id: expenseId, business_id: businessId } });
    if (!existing) throw new NotFoundError('Expense');

    return prisma.expense.delete({ where: { id: expenseId } });
  }

  /**
   * Get expense stats/dashboard
   */
  async getExpenseStats(businessId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [standaloneToday, standaloneMonth, purchaseExpensesTotal, saleExpensesTotal] = await Promise.all([
      prisma.expense.aggregate({
        // Bounded to [today, tomorrow) so post-dated expenses don't inflate the
        // "Today" card indefinitely.
        where: { business_id: businessId, expense_date: { gte: today, lt: tomorrow } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { business_id: businessId, expense_date: { gte: thisMonthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      // Purchase/sale expense aggregates use the same current-month window as
      // "This Month" so all four stat cards describe one period.
      prisma.purchaseExpense.aggregate({
        where: { purchase: { business_id: businessId, status: { not: 'CANCELLED' }, purchase_date: { gte: thisMonthStart } } },
        _sum: { amount: true },
      }),
      prisma.saleExpense.aggregate({
        where: { sale: { business_id: businessId, status: { not: 'CANCELLED' }, sale_date: { gte: thisMonthStart } } },
        _sum: { amount: true },
      }),
    ]);

    return {
      today: {
        count: standaloneToday._count,
        amount: Number(standaloneToday._sum.amount || 0),
      },
      thisMonth: {
        count: standaloneMonth._count,
        amount: Number(standaloneMonth._sum.amount || 0),
      },
      overall: {
        standalone: Number(standaloneMonth._sum.amount || 0),
        purchase: Number(purchaseExpensesTotal._sum.amount || 0),
        sale: Number(saleExpensesTotal._sum.amount || 0),
        total: Number(standaloneMonth._sum.amount || 0) + Number(purchaseExpensesTotal._sum.amount || 0) + Number(saleExpensesTotal._sum.amount || 0),
      },
    };
  }
}

export const expenseService = new ExpenseService();
