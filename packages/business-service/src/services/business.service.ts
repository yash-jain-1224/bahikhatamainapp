import { v4 as uuidv4 } from 'uuid';
import {
  createLogger, getPrismaClient, getPlatformSettings,
  ForbiddenError, ConflictError, NotFoundError,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('business-service');

export class BusinessService {
  /**
   * Create a new business and assign owner
   */
  async createBusiness(userId: string, data: {
    name: string;
    type?: string;
    gstNumber?: string;
    panNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
  }) {
    // "Max Businesses per User" from Platform Settings. It was a decorative
    // number on the admin screen — nothing consulted it, so the limit an admin
    // set was never applied to anyone.
    const settings = await getPlatformSettings();

    return prisma.$transaction(async (tx: any) => {
      // Check if this is the user's first business (it becomes primary)
      const existingBusinessCount = await tx.businessUser.count({
        where: { user_id: userId, is_active: true },
      });
      const isPrimary = existingBusinessCount === 0;

      const maxBusinesses = Number(settings.maxBusinessesPerUser);
      if (Number.isFinite(maxBusinesses) && maxBusinesses > 0 && existingBusinessCount >= maxBusinesses) {
        throw new ForbiddenError(
          `You have reached the limit of ${maxBusinesses} businesses per account. Contact support to raise it.`,
        );
      }

      // Create business
      const business = await tx.business.create({
        data: {
          id: uuidv4(),
          name: data.name,
          type: (data.type as any) || 'TRADING',
          gst_number: data.gstNumber,
          pan_number: data.panNumber,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          phone: data.phone,
          email: data.email,
          logo_url: data.logoUrl,
          is_primary: isPrimary,
        },
      });

      // Assign user as OWNER
      await tx.businessUser.create({
        data: {
          id: uuidv4(),
          user_id: userId,
          business_id: business.id,
          role: 'OWNER',
        },
      });

      // Create default expense types
      const defaultExpenses = [
        { name: 'Freight', category: 'DIRECT' as const },
        { name: 'Loading', category: 'DIRECT' as const },
        { name: 'Transport', category: 'DIRECT' as const },
        { name: 'Packaging', category: 'DIRECT' as const },
        { name: 'Labour', category: 'INDIRECT' as const },
        { name: 'Polish', category: 'INDIRECT' as const },
        { name: 'Royalties', category: 'INDIRECT' as const },
        { name: 'Commission', category: 'INDIRECT' as const },
        { name: 'Misc', category: 'INDIRECT' as const },
      ];

      for (const expense of defaultExpenses) {
        await tx.expenseType.create({
          data: {
            id: uuidv4(),
            business_id: business.id,
            name: expense.name,
            category: expense.category,
            is_default: true,
          },
        });
      }

      // NOTE: Subscription is NOT auto-assigned here.
      // After business creation, the user is redirected to the plan selection page.
      // The trial/subscription only starts once the user picks a plan (even the free one).

      logger.info('Business created', { businessId: business.id, userId, isPrimary });
      return business;
    });
  }

  /**
   * Get business by ID with related data
   */
  async getBusinessById(businessId: string) {
    return prisma.business.findUnique({
      where: { id: businessId },
      include: {
        shops: { where: { is_active: true } },
        subscriptions: {
          where: { status: { in: ['TRIAL', 'ACTIVE'] } },
          include: { plan: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            business_users: true,
            parties: true,
            purchases: true,
            sales: true,
          },
        },
      },
    });
  }

  /**
   * Get all businesses for a user
   */
  async getUserBusinesses(userId: string) {
    const businessUsers = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true },
      include: {
        business: {
          include: {
            subscriptions: {
              where: { status: { in: ['TRIAL', 'ACTIVE'] } },
              include: { plan: true },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return businessUsers.map((bu: any) => ({
      ...bu.business,
      role: bu.role,
      subscription: bu.business.subscriptions[0] || null,
    }));
  }

  /**
   * Update business
   */
  async updateBusiness(businessId: string, data: Record<string, any>) {
    const business = await prisma.business.findUnique({ where: { id: businessId } }) as any;

    // Prevent deactivating a primary business
    // NOTE: camelCase — every other field here is camelCase and that is what
    // updateBusinessSchema validates. Reading `data.is_active` meant this guard
    // (and the is_active write below) never saw the flag at all.
    if (business?.is_primary && data.isActive === false) {
      throw new ConflictError('Primary business cannot be deactivated. You can only edit it.');
    }

    return prisma.business.update({
      where: { id: businessId },
      data: {
        name: data.name,
        type: data.type,
        gst_number: data.gstNumber,
        pan_number: data.panNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        invoice_prefix: data.invoicePrefix,
        purchase_prefix: data.purchasePrefix,
        financial_year_start: data.financialYearStart,
        logo_url: data.logoUrl,
        // is_active can only be set for non-primary businesses
        ...(data.isActive !== undefined && !business?.is_primary ? { is_active: data.isActive } : {}),
      } as any,
    });
  }

  /**
   * Update only the logo_url of a business
   */
  async updateBusinessLogo(businessId: string, logo_url: string) {
    return prisma.business.update({
      where: { id: businessId },
      data: { logo_url } as any,
    });
  }

  /**
   * Invite user to business
   */
  async inviteUser(businessId: string, phone: string, role: string, invitedBy: string) {
    // Find or create user
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await prisma.user.create({
        data: { id: uuidv4(), phone },
      });
    }

    // Check if already member
    const existing = await prisma.businessUser.findUnique({
      where: {
        user_id_business_id: {
          user_id: user.id,
          business_id: businessId,
        },
      },
    });

    if (existing) {
      throw new ConflictError('User is already a member of this business');
    }

    // "Max Users per Business" from Platform Settings — another value the admin
    // could set and that nothing enforced.
    const settings = await getPlatformSettings();
    const maxUsers = Number(settings.maxUsersPerBusiness);
    if (Number.isFinite(maxUsers) && maxUsers > 0) {
      const memberCount = await prisma.businessUser.count({
        where: { business_id: businessId, is_active: true },
      });
      if (memberCount >= maxUsers) {
        throw new ForbiddenError(
          `This business has reached the limit of ${maxUsers} users. Contact support to raise it.`,
        );
      }
    }

    const businessUser = await prisma.businessUser.create({
      data: {
        id: uuidv4(),
        user_id: user.id,
        business_id: businessId,
        role: role as any,
        invited_by: invitedBy,
      },
    });

    logger.info('User invited', { businessId, phone, role });
    return businessUser;
  }

  /**
   * Create shop
   */
  async createShop(businessId: string, data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    gstNumber?: string;
  }) {
    return prisma.shop.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        gst_number: data.gstNumber,
      },
    });
  }

  /**
   * Get business dashboard data
   * @param from  ISO date string (YYYY-MM-DD) for the start of the period (defaults to today)
   * @param to    ISO date string (YYYY-MM-DD) for the end of the period (defaults to today)
   */
  async getDashboard(businessId: string, from?: string, to?: string) {
    const todayBase = new Date();
    todayBase.setHours(0, 0, 0, 0);

    // Resolve period start/end from query params or default to today
    const periodStart = from ? new Date(`${from}T00:00:00`) : new Date(todayBase);
    const periodEnd   = to   ? new Date(`${to}T23:59:59.999`) : new Date(todayBase.getTime() + 86400000 - 1);

    // Determine chart granularity: if period spans ≤ 31 days use days, else use months
    const diffDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
    const useMonths = diffDays > 31;

    // Build chart buckets
    type Bucket = { label: string; start: Date; end: Date };
    const chartBuckets: Bucket[] = [];

    if (useMonths) {
      // Monthly buckets from start month to end month
      const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
      const endMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      while (cursor <= endMonth) {
        const bucketStart = new Date(cursor);
        const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        chartBuckets.push({ label: MONTH_NAMES[cursor.getMonth()], start: bucketStart, end: bucketEnd });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      // Daily buckets
      const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(periodStart);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        // For ranges >7 days use short date label (e.g. "5 Mar"), else day name
        const label = diffDays > 7
          ? `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`
          : DAY_NAMES[d.getDay()];
        chartBuckets.push({ label, start: d, end: next });
      }
    }

    const [
      purchasesToday,
      salesToday,
      outstandingPayable,
      outstandingReceivable,
      lowStockItems,
      partialPayments,
      weeklyPurchases,
      weeklySales,
    ] = await Promise.all([
      prisma.purchase.aggregate({
        where: {
          business_id: businessId,
          purchase_date: { gte: periodStart, lte: periodEnd },
          status: 'ACTIVE',
        },
        _sum: { total_amount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          business_id: businessId,
          sale_date: { gte: periodStart, lte: periodEnd },
          status: 'ACTIVE',
        },
        _sum: { total_amount: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: {
          business_id: businessId,
          status: 'ACTIVE',
          payment_status: { in: ['UNPAID', 'PARTIAL', 'CREDIT'] },
        },
        _sum: { balance_amount: true },
      }),
      prisma.sale.aggregate({
        where: {
          business_id: businessId,
          status: 'ACTIVE',
          payment_status: { in: ['UNPAID', 'PARTIAL', 'CREDIT'] },
        },
        _sum: { balance_amount: true },
      }),
      prisma.inventoryItem.count({
        where: {
          business_id: businessId,
          is_active: true,
          current_stock: { lte: prisma.inventoryItem.fields.min_stock as any },
        },
      }),
      prisma.purchase.count({
        where: {
          business_id: businessId,
          status: 'ACTIVE',
          payment_status: 'PARTIAL',
        },
      }),
      // Chart purchases — one query per bucket
      Promise.all(
        chartBuckets.map(({ start, end }) =>
          prisma.purchase.aggregate({
            where: { business_id: businessId, status: 'ACTIVE', purchase_date: { gte: start, lt: end } },
            _sum: { total_amount: true },
          })
        )
      ),
      // Chart sales — one query per bucket
      Promise.all(
        chartBuckets.map(({ start, end }) =>
          prisma.sale.aggregate({
            where: { business_id: businessId, status: 'ACTIVE', sale_date: { gte: start, lt: end } },
            _sum: { total_amount: true },
          })
        )
      ),
    ]);

    const weeklyChart = chartBuckets.map((d, i) => ({
      name: d.label,
      purchase: Number(weeklyPurchases[i]._sum.total_amount || 0),
      sales: Number(weeklySales[i]._sum.total_amount || 0),
    }));

    // The dashboard's "Recent Transactions" card reads `recentTransactions`,
    // which this endpoint never returned — so the card rendered as a bare header
    // and a "View all" button with no rows and not even an empty state, for
    // every business regardless of how much trading it had done.
    const [recentPurchases, recentSales] = await Promise.all([
      prisma.purchase.findMany({
        where: { business_id: businessId, status: 'ACTIVE' },
        include: { party: { select: { name: true } } },
        orderBy: { purchase_date: 'desc' },
        take: 5,
      }),
      prisma.sale.findMany({
        where: { business_id: businessId, status: 'ACTIVE' },
        include: { party: { select: { name: true } } },
        orderBy: { sale_date: 'desc' },
        take: 5,
      }),
    ]);

    const recentTransactions = [
      ...recentPurchases.map((p: any) => ({
        id: p.id,
        type: 'PURCHASE' as const,
        party: p.party?.name || 'Unknown',
        date: p.purchase_date,
        amount: Number(p.total_amount || 0),
        status: p.payment_status,
      })),
      ...recentSales.map((s: any) => ({
        id: s.id,
        type: 'SALE' as const,
        party: s.party?.name || 'Unknown',
        date: s.sale_date,
        amount: Number(s.total_amount || 0),
        status: s.payment_status,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return {
      recentTransactions,
      purchaseToday: {
        count: purchasesToday._count,
        total: Number(purchasesToday._sum.total_amount || 0),
      },
      salesToday: {
        count: salesToday._count,
        total: Number(salesToday._sum.total_amount || 0),
      },
      outstandingPayable: Number(outstandingPayable._sum.balance_amount || 0),
      outstandingReceivable: Number(outstandingReceivable._sum.balance_amount || 0),
      lowStockAlerts: lowStockItems,
      partialPaymentAlerts: partialPayments,
      weeklyChart,
    };
  }

  // ─── BANK ACCOUNTS ────────────────────────────────────────────────────────

  async listBankAccounts(businessId: string) {
    return prisma.businessBankAccount.findMany({
      where: { business_id: businessId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  }

  async createBankAccount(businessId: string, data: {
    accountName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    upiId?: string;
    isDefault?: boolean;
  }) {
    // If setting as default, unset existing default
    if (data.isDefault) {
      await prisma.businessBankAccount.updateMany({
        where: { business_id: businessId, is_default: true },
        data: { is_default: false },
      });
    }

    return prisma.businessBankAccount.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        account_name: data.accountName,
        account_number: data.accountNumber,
        ifsc_code: data.ifscCode,
        bank_name: data.bankName,
        upi_id: data.upiId || null,
        is_default: data.isDefault || false,
      },
    });
  }

  async updateBankAccount(businessId: string, accountId: string, data: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    upiId?: string;
    isDefault?: boolean;
  }) {
    const existing = await prisma.businessBankAccount.findFirst({
      where: { id: accountId, business_id: businessId },
    });
    if (!existing) throw new NotFoundError('Bank account');

    // If setting as default, unset existing default
    if (data.isDefault) {
      await prisma.businessBankAccount.updateMany({
        where: { business_id: businessId, is_default: true, id: { not: accountId } },
        data: { is_default: false },
      });
    }

    return prisma.businessBankAccount.update({
      where: { id: accountId },
      data: {
        ...(data.accountName !== undefined ? { account_name: data.accountName } : {}),
        ...(data.accountNumber !== undefined ? { account_number: data.accountNumber } : {}),
        ...(data.ifscCode !== undefined ? { ifsc_code: data.ifscCode } : {}),
        ...(data.bankName !== undefined ? { bank_name: data.bankName } : {}),
        ...(data.upiId !== undefined ? { upi_id: data.upiId || null } : {}),
        ...(data.isDefault !== undefined ? { is_default: data.isDefault } : {}),
      },
    });
  }

  async deleteBankAccount(businessId: string, accountId: string) {
    const existing = await prisma.businessBankAccount.findFirst({
      where: { id: accountId, business_id: businessId },
    });
    if (!existing) throw new NotFoundError('Bank account');

    return prisma.businessBankAccount.delete({ where: { id: accountId } });
  }

  // ─── BANK STATEMENT UPLOAD & MATCHING ─────────────────────────────────────

  /**
   * Parse uploaded bank statement CSV and return entries for review.
   * Expected CSV format: Date, Description/Narration, Debit, Credit, Balance
   */
  async parseStatementCSV(rows: Array<{
    date: string;
    narration: string;
    debit: number;
    credit: number;
    balance: number;
    reference?: string;
  }>) {
    return rows.map((row, idx) => ({
      id: `stmt-${idx}`,
      date: row.date,
      narration: row.narration,
      debit: row.debit || 0,
      credit: row.credit || 0,
      balance: row.balance || 0,
      reference: row.reference || '',
      matchStatus: 'unmatched' as const,
      matchedEntryId: null as string | null,
    }));
  }

  /**
   * Find potential ledger entry matches for a bank statement entry.
   * Matches by amount and approximate date.
   */
  async findMatches(businessId: string, entry: {
    date: string;
    amount: number;
    type: 'debit' | 'credit';
    narration?: string;
  }) {
    const entryDate = new Date(entry.date);
    const dateBefore = new Date(entryDate);
    dateBefore.setDate(dateBefore.getDate() - 3);
    const dateAfter = new Date(entryDate);
    dateAfter.setDate(dateAfter.getDate() + 3);

    // Map: debit in bank = credit in our books (money going out), credit in bank = debit in our books (money coming in)
    const entryType = entry.type === 'debit' ? 'CREDIT' : 'DEBIT';

    const matches = await prisma.ledgerEntry.findMany({
      where: {
        business_id: businessId,
        amount: { gte: entry.amount - 0.01, lte: entry.amount + 0.01 },
        entry_date: { gte: dateBefore, lte: dateAfter },
        account_type: { in: ['CASH', 'BANK'] },
        entry_type: entryType,
      },
      include: {
        party: { select: { id: true, name: true } },
        purchase: { select: { id: true, purchase_number: true } },
        sale: { select: { id: true, sale_number: true } },
      },
      take: 10,
    });

    return matches;
  }

  /**
   * Reconcile: mark a bank statement entry as matched with a ledger entry.
   * Optionally creates a new ledger entry if no match exists.
   */
  async reconcileEntry(businessId: string, data: {
    ledgerEntryId?: string;
    // If no match, create a new entry:
    date: string;
    amount: number;
    type: 'debit' | 'credit';
    narration: string;
    partyId?: string;
    accountType?: string;
  }) {
    if (data.ledgerEntryId) {
      // Actually record the match. This used to be
      // `data: { narration: undefined }` — an update that writes no column, so
      // the UI's "Matched" state and reconciled counter were pure theatre and
      // every match disappeared on reload.
      // Scoped to the caller's business: the id comes from the request body.
      const updated = await prisma.ledgerEntry.updateMany({
        where: { id: data.ledgerEntryId, business_id: businessId },
        data: { reconciled_at: new Date() },
      });
      if (updated.count === 0) throw new NotFoundError('Ledger entry');
      return prisma.ledgerEntry.findFirst({
        where: { id: data.ledgerEntryId, business_id: businessId },
      });
    }

    // partyId is client-supplied; verify it belongs to this business before any
    // balance is moved.
    if (data.partyId) {
      const party = await prisma.party.findFirst({
        where: { id: data.partyId, business_id: businessId },
        select: { id: true },
      });
      if (!party) throw new NotFoundError('Party');
    }

    // The entry and the balance it implies must move together.
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId || null,
          entry_date: new Date(data.date),
          account_type: (data.accountType || 'BANK') as any,
          entry_type: data.type === 'debit' ? 'CREDIT' : 'DEBIT',
          amount: data.amount,
          narration: data.narration || 'Bank statement entry',
          reference_type: 'manual',
          reference_id: uuidv4(),
          // Created *from* a statement line, so it is reconciled by definition.
          reconciled_at: new Date(),
        },
      });

      if (data.partyId) {
        const delta = data.type === 'credit' ? data.amount : -data.amount;
        await tx.party.update({
          where: { id: data.partyId },
          data: { balance: { increment: delta } },
        });
      }

      return entry;
    });
  }

  // ─── CREDIT CARDS ─────────────────────────────────────────────────────────

  async listCreditCards(businessId: string) {
    return prisma.businessCreditCard.findMany({
      where: { business_id: businessId, is_active: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async getCreditCard(businessId: string, cardId: string) {
    const card = await prisma.businessCreditCard.findFirst({
      where: { id: cardId, business_id: businessId },
    });
    if (!card) throw new NotFoundError('Credit card');
    return card;
  }

  async createCreditCard(businessId: string, data: {
    cardName: string;
    cardNumber: string;      // Last 4 digits only
    cardNetwork?: string;
    bankName: string;
    cardHolder?: string;
    billingDate?: number;
    dueDate?: number;
    creditLimit?: number;
  }) {
    return prisma.businessCreditCard.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        card_name: data.cardName,
        card_number: data.cardNumber.slice(-4), // Store only last 4
        card_network: data.cardNetwork || 'VISA',
        bank_name: data.bankName,
        card_holder: data.cardHolder || null,
        billing_date: data.billingDate || null,
        due_date: data.dueDate || null,
        credit_limit: data.creditLimit || null,
        current_balance: 0,
      },
    });
  }

  async updateCreditCard(businessId: string, cardId: string, data: {
    cardName?: string;
    cardNumber?: string;
    cardNetwork?: string;
    bankName?: string;
    cardHolder?: string;
    billingDate?: number | null;
    dueDate?: number | null;
    creditLimit?: number | null;
    currentBalance?: number;
    isActive?: boolean;
  }) {
    const existing = await prisma.businessCreditCard.findFirst({
      where: { id: cardId, business_id: businessId },
    });
    if (!existing) throw new NotFoundError('Credit card');

    return prisma.businessCreditCard.update({
      where: { id: cardId },
      data: {
        ...(data.cardName !== undefined ? { card_name: data.cardName } : {}),
        ...(data.cardNumber !== undefined ? { card_number: data.cardNumber.slice(-4) } : {}),
        ...(data.cardNetwork !== undefined ? { card_network: data.cardNetwork } : {}),
        ...(data.bankName !== undefined ? { bank_name: data.bankName } : {}),
        ...(data.cardHolder !== undefined ? { card_holder: data.cardHolder || null } : {}),
        ...(data.billingDate !== undefined ? { billing_date: data.billingDate } : {}),
        ...(data.dueDate !== undefined ? { due_date: data.dueDate } : {}),
        ...(data.creditLimit !== undefined ? { credit_limit: data.creditLimit } : {}),
        ...(data.currentBalance !== undefined ? { current_balance: data.currentBalance } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
      },
    });
  }

  async deleteCreditCard(businessId: string, cardId: string) {
    const existing = await prisma.businessCreditCard.findFirst({
      where: { id: cardId, business_id: businessId },
    });
    if (!existing) throw new NotFoundError('Credit card');

    // Soft delete — mark as inactive
    return prisma.businessCreditCard.update({
      where: { id: cardId },
      data: { is_active: false },
    });
  }

  // ─── CREDIT CARD STATEMENT UPLOAD & MATCHING ──────────────────────────────

  /**
   * Parse uploaded credit card statement CSV and return entries for review.
   * Expected CSV format: Date, Description, Amount/Debit, Credit, (optional fields)
   */
  async parseCreditCardStatementCSV(rows: Array<{
    date: string;
    narration: string;
    debit: number;
    credit: number;
    reference?: string;
  }>) {
    return rows.map((row, idx) => ({
      id: `cc-stmt-${idx}`,
      date: row.date,
      narration: row.narration,
      debit: row.debit || 0,
      credit: row.credit || 0,
      reference: row.reference || '',
      matchStatus: 'unmatched' as const,
      matchedEntryId: null as string | null,
    }));
  }

  /**
   * Find potential ledger entry matches for a credit card statement entry.
   * Matches by amount and approximate date.
   */
  async findCreditCardMatches(businessId: string, entry: {
    date: string;
    amount: number;
    type: 'debit' | 'credit';
    narration?: string;
  }) {
    const entryDate = new Date(entry.date);
    const dateBefore = new Date(entryDate);
    dateBefore.setDate(dateBefore.getDate() - 5); // wider window for CC
    const dateAfter = new Date(entryDate);
    dateAfter.setDate(dateAfter.getDate() + 5);

    // For CC: debit = spend (money going out from business perspective)
    // credit = payment/refund (money coming back)
    const entryType = entry.type === 'debit' ? 'CREDIT' : 'DEBIT';

    const matches = await prisma.ledgerEntry.findMany({
      where: {
        business_id: businessId,
        amount: { gte: entry.amount - 0.01, lte: entry.amount + 0.01 },
        entry_date: { gte: dateBefore, lte: dateAfter },
        entry_type: entryType,
      },
      include: {
        party: { select: { id: true, name: true } },
        purchase: { select: { id: true, purchase_number: true } },
        sale: { select: { id: true, sale_number: true } },
      },
      take: 10,
    });

    return matches;
  }

  /**
   * Reconcile a credit card statement entry:
   * - Match with existing ledger entry, OR
   * - Create a new expense/ledger entry for unmatched CC transactions
   */
  async reconcileCreditCardEntry(businessId: string, cardId: string, data: {
    ledgerEntryId?: string;
    date: string;
    amount: number;
    type: 'debit' | 'credit';
    narration: string;
    partyId?: string;
  }) {
    // cardId comes straight from the URL and was never checked against the
    // caller's business — unlike every sibling method on this model. A caller
    // could reconcile against another tenant's card id: the ledger entry landed
    // in their own business (so requirePermission passed) while the victim's
    // card outstanding balance was silently mutated.
    const card = await prisma.businessCreditCard.findFirst({
      where: { id: cardId, business_id: businessId },
      select: { id: true },
    });
    if (!card) throw new NotFoundError('Credit card');

    if (data.partyId) {
      const party = await prisma.party.findFirst({
        where: { id: data.partyId, business_id: businessId },
        select: { id: true },
      });
      if (!party) throw new NotFoundError('Party');
    }

    if (data.ledgerEntryId) {
      // Record the match for real — see reconcileEntry above.
      const updated = await prisma.ledgerEntry.updateMany({
        where: { id: data.ledgerEntryId, business_id: businessId },
        data: { reconciled_at: new Date() },
      });
      if (updated.count === 0) throw new NotFoundError('Ledger entry');
      return prisma.ledgerEntry.findFirst({
        where: { id: data.ledgerEntryId, business_id: businessId },
      });
    }

    // Ledger entry, card balance and party balance move together or not at all.
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId || null,
          entry_date: new Date(data.date),
          account_type: 'BANK' as any, // CC treated as bank-like account
          entry_type: data.type === 'debit' ? 'CREDIT' : 'DEBIT',
          amount: data.amount,
          narration: data.narration || 'Credit card statement entry',
          reference_type: 'manual',
          reference_id: uuidv4(),
          reconciled_at: new Date(),
        },
      });

      const balanceDelta = data.type === 'debit' ? data.amount : -data.amount;
      await tx.businessCreditCard.update({
        where: { id: cardId },
        data: { current_balance: { increment: balanceDelta } },
      });

      if (data.partyId) {
        const partyDelta = data.type === 'credit' ? data.amount : -data.amount;
        await tx.party.update({
          where: { id: data.partyId },
          data: { balance: { increment: partyDelta } },
        });
      }

      return entry;
    });
  }
}

export const businessService = new BusinessService();
