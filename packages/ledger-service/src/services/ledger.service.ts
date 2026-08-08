import { v4 as uuidv4 } from 'uuid';
import {
  createLogger, parsePagination, getPaginationOffset, buildPaginationMeta,
  NotFoundError, BadRequestError, getFinancialYearDates,
  getPrismaClient,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('ledger-service');

/**
 * Normalise a report's date bounds to whole days.
 *
 * Named toStartOfDay/toEndOfDay rather than startOfDay/endOfDay: getDayBook
 * declares local variables with those exact names, and shadowing a module
 * function with a local is the kind of thing that reads fine and breaks later.
 *
 * Bind these into raw SQL as `${d.toISOString()}::timestamp`. `entry_date` is
 * `timestamp without time zone` holding UTC instants, and node-postgres
 * serialises a JS Date using LOCAL components — so a raw query and a Prisma
 * `findMany` on the same bounds selected different rows on any non-UTC host.
 * That is the underlying reason Trial Balance and Day Book could not be
 * reconciled for the same range, beyond the end-date exclusion below.
 *
 * `new Date('2026-08-06')` is midnight, so `lte: endDate` excluded everything
 * recorded on the end date itself — and ReportsPage defaults the end date to
 * today. Trial Balance, P&L and the Balance Sheet were therefore all missing
 * the current day while the Day Book, which does normalise, showed it: the two
 * tabs could never be reconciled against each other for the same range.
 */
function toStartOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toEndOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * The party-facing control accounts.
 *
 * Every sale and purchase writes BOTH legs of its journal entry against the
 * same party_id — a sale writes PARTY_RECEIVABLE/DEBIT *and* SALES/CREDIT, a
 * purchase writes INVENTORY/DEBIT *and* PARTY_PAYABLE/CREDIT. Showing both on a
 * party's ledger made every amount cancel itself out: a ₹100,000 unpaid sale
 * rendered as two rows and a net balance of zero, so the drill-down page said
 * "they owe 0" for a party who owed a lakh.
 *
 * Only the party-side legs belong on a party's statement; CASH, BANK, SALES,
 * PURCHASE and INVENTORY are the business side of the same transaction.
 */
const PARTY_CONTROL_ACCOUNTS = ['PARTY_PAYABLE', 'PARTY_RECEIVABLE'] as const;

/**
 * Rows that belong on a party statement: the party-side legs, plus manual
 * adjustments. A manual entry is single-leg (createManualEntry writes one row
 * and moves party.balance by that amount), so including it cannot double-count
 * — and excluding it would hide adjustments that demonstrably changed the
 * balance the page displays.
 */
function partyStatementScope(): any {
  return {
    OR: [
      { account_type: { in: PARTY_CONTROL_ACCOUNTS as unknown as string[] } },
      { reference_type: 'manual' },
    ],
  };
}

/**
 * Build the shared ledger-entry filters from a query string.
 *
 * The UI and this service had disjoint vocabularies: AdvancedFilters emits
 * `date_from` / `date_to` / `account_type` / `entry_type` / `amount_min` /
 * `amount_max`, while this service only ever read `startDate` / `endDate` /
 * `accountType` / `entryType`. Nothing overlapped, so every filter and the
 * search box on the Ledger page were silently inert — the chips appeared, the
 * request went out, and the unfiltered list came back. Accept both spellings.
 */
function applyLedgerFilters(where: any, query: Record<string, any>): void {
  const startDate = query.startDate ?? query.date_from;
  const endDate = query.endDate ?? query.date_to;
  if (startDate) where.entry_date = { ...where.entry_date, gte: new Date(startDate) };
  if (endDate) {
    // A bare date lands at 00:00, which would exclude everything recorded later
    // that same day. Push an end-of-day boundary when no time component is given.
    const end = new Date(endDate);
    if (!String(endDate).includes('T')) end.setHours(23, 59, 59, 999);
    where.entry_date = { ...where.entry_date, lte: end };
  }

  const accountType = query.accountType ?? query.account_type;
  if (accountType) where.account_type = accountType;

  const entryType = query.entryType ?? query.entry_type;
  if (entryType) where.entry_type = entryType;

  const min = query.amount_min ?? query.minAmount;
  const max = query.amount_max ?? query.maxAmount;
  if (min !== undefined && min !== '' && Number.isFinite(Number(min))) {
    where.amount = { ...where.amount, gte: Number(min) };
  }
  if (max !== undefined && max !== '' && Number.isFinite(Number(max))) {
    where.amount = { ...where.amount, lte: Number(max) };
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    where.OR = [
      { narration: { contains: search, mode: 'insensitive' } },
      { party: { name: { contains: search, mode: 'insensitive' } } },
      { purchase: { purchase_number: { contains: search, mode: 'insensitive' } } },
      { sale: { sale_number: { contains: search, mode: 'insensitive' } } },
    ];
  }
}

export class LedgerService {
  // ─── LEDGER ENTRIES ─────────────────────────────────────
  async getPartyLedger(businessId: string, partyId: string, query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId, party_id: partyId };
    applyLedgerFilters(where, query);

    // ─── IMPORTANT: Only include entries from Sales/Purchase transactions ───
    // Exclude cutter, expense, and other third-party entries so that the
    // party ledger reflects only direct business transactions.
    // reference_type: 'cutter' → cutter payable (separate entity)
    // reference_type: 'expense' → standalone expense (separate entity)
    // Only include: 'purchase', 'sale', 'payment', 'manual'
    if (!query.includeAll) {
      where.reference_type = { in: ['purchase', 'sale', 'payment', 'manual'] };
    }

    // Keep only the party-side legs, so the two halves of each journal entry
    // stop cancelling each other out. Composed under AND because
    // applyLedgerFilters may already have claimed `where.OR` for the search
    // term — two top-level ORs would silently overwrite one another.
    // An explicit account_type from the filter bar wins over this default.
    if (where.account_type === undefined && !query.includeAll) {
      where.AND = [...(where.AND ?? []), partyStatementScope()];
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          purchase: { select: { id: true, purchase_number: true, total_amount: true } },
          sale: { select: { id: true, sale_number: true, total_amount: true } },
          payment: { select: { id: true, payment_mode: true, amount: true } },
        },
        orderBy: { entry_date: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    // Calculate running balance from only Sale/Purchase related entries
    const party = await prisma.party.findFirst({
      where: { id: partyId, business_id: businessId },
    });

    return {
      party,
      data: entries,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async getBusinessLedger(businessId: string, query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId };
    applyLedgerFilters(where, query);
    // The party chip on this page arrives as ?partyId= (deep link from a party
    // row) or party_id= from the filter bar. Neither was read, so "view ledger
    // for this party" quietly rendered the entire business ledger instead.
    const partyId = query.partyId ?? query.party_id;
    if (partyId) where.party_id = partyId;

    const [entries, total, sums] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, phone: true } },
          purchase: { select: { id: true, purchase_number: true } },
          sale: { select: { id: true, sale_number: true } },
        },
        orderBy: { entry_date: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where }),
      // Debit/credit totals over the WHOLE filtered set (same where as the
      // list). The page is paginated; the frontend used to sum only the
      // loaded rows and present that slice as business-wide figures.
      prisma.ledgerEntry.groupBy({
        by: ['entry_type'],
        where,
        _sum: { amount: true },
      }),
    ]);

    const totals = { debit: 0, credit: 0 };
    for (const row of sums) {
      const amount = Number(row._sum.amount || 0);
      if (row.entry_type === 'DEBIT') totals.debit = amount;
      else totals.credit = amount;
    }

    return { data: entries, meta: buildPaginationMeta(total, page, limit), totals };
  }

  // ─── CREATE LEDGER ENTRY (Manual / Adjustment) ──────────
  async createManualEntry(businessId: string, _userId: string, data: {
    partyId?: string; accountType: string; entryType: 'DEBIT' | 'CREDIT';
    amount: number; narration?: string; entryDate?: string;
  }) {
    // partyId comes straight from the request body. It used to be written onto
    // the entry and then passed to party.update({ where: { id } }) with no
    // business scoping at all, so a caller could name a party belonging to
    // another business and shift that tenant's balance. Check ownership first.
    if (data.partyId) {
      const party = await prisma.party.findFirst({
        where: { id: data.partyId, business_id: businessId },
        select: { id: true },
      });
      if (!party) throw new NotFoundError('Party');
    }

    // The entry and the balance it implies have to move together; as two
    // separate writes, a failure on the second left the ledger and the party
    // balance permanently disagreeing.
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId,
          entry_date: data.entryDate ? new Date(data.entryDate) : new Date(),
          account_type: data.accountType as any,
          entry_type: data.entryType as any,
          amount: data.amount,
          narration: data.narration || 'Manual Entry',
          reference_type: 'manual',
          reference_id: uuidv4(),
        },
      });

      if (data.partyId) {
        const delta = data.entryType === 'DEBIT' ? data.amount : -data.amount;
        await tx.party.update({
          where: { id: data.partyId },
          data: { balance: { increment: delta } },
        });
      }

      return created;
    });

    logger.info('Manual ledger entry created', { entryId: entry.id, businessId });
    return entry;
  }

  /**
   * Delete manual ledger entries.
   *
   * The Ledger page's "Delete selected" reported success and called no API at
   * all — there was no endpoint to call. The rows stayed, and the user believed
   * accounting records had been removed.
   *
   * Deliberately limited to `reference_type: 'manual'`. Entries generated by a
   * purchase, sale or payment are one leg of a document's journal entry;
   * deleting a leg on its own would leave the books unbalanced and the source
   * document silently misstated. Those must be reversed by voiding the
   * document, not by deleting a ledger row.
   */
  async deleteManualEntries(businessId: string, entryIds: string[]) {
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      throw new BadRequestError('No entries specified');
    }

    return prisma.$transaction(async (tx) => {
      const entries = await tx.ledgerEntry.findMany({
        where: { id: { in: entryIds }, business_id: businessId },
      });

      const nonManual = entries.filter((e) => e.reference_type !== 'manual');
      if (nonManual.length > 0) {
        throw new BadRequestError(
          `${nonManual.length} of the selected entries were generated by a purchase, sale or payment `
          + 'and cannot be deleted on their own. Void the source document instead.',
        );
      }

      // Reverse each entry's effect on the party balance, mirroring what
      // createManualEntry applied. Skipping this would delete the row and leave
      // the balance permanently shifted by an entry that no longer exists.
      for (const entry of entries) {
        if (!entry.party_id) continue;
        const amount = Number(entry.amount);
        const delta = entry.entry_type === 'DEBIT' ? -amount : amount;
        await tx.party.update({
          where: { id: entry.party_id },
          data: { balance: { increment: delta } },
        });
      }

      const result = await tx.ledgerEntry.deleteMany({
        where: { id: { in: entries.map((e) => e.id) }, business_id: businessId },
      });

      logger.info('Manual ledger entries deleted', { businessId, count: result.count });
      return { deleted: result.count, requested: entryIds.length };
    });
  }

  // ─── PARTY STATEMENT ───────────────────────────────────
  async getPartyStatement(businessId: string, partyId: string, query: Record<string, any>) {
    const party = await prisma.party.findFirst({
      where: { id: partyId, business_id: businessId },
    });
    if (!party) throw new NotFoundError('Party');

    const dateFilter: any = {};
    if (query.startDate ?? query.date_from) {
      dateFilter.gte = new Date(query.startDate ?? query.date_from);
    }
    if (query.endDate ?? query.date_to) {
      // A bare date lands at 00:00, which would drop everything recorded later
      // that same day.
      const raw = query.endDate ?? query.date_to;
      const end = new Date(raw);
      if (!String(raw).includes('T')) end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    // Only include entries from Sales/Purchase transactions (not cutters, expenses, etc.)
    const entries = await prisma.ledgerEntry.findMany({
      where: {
        business_id: businessId,
        party_id: partyId,
        // Exclude cutter and expense entries — those belong to separate ledgers
        reference_type: { in: ['purchase', 'sale', 'payment', 'manual'] },
        // ...and keep only the party-side leg of each journal entry. This
        // endpoint had no account filter at all, so it returned both halves and
        // every amount cancelled itself out — the statement the Party Ledger
        // page renders showed a closing balance of ~0 for a party who owed a
        // lakh. See PARTY_CONTROL_ACCOUNTS above.
        ...partyStatementScope(),
        ...(Object.keys(dateFilter).length > 0 && { entry_date: dateFilter }),
      },
      orderBy: { entry_date: 'asc' },
    });

    // Build statement with running balance
    let runningBalance = 0;
    const statement = entries.map((entry: any) => {
      const amount = Number(entry.amount);
      runningBalance += entry.entry_type === 'DEBIT' ? amount : -amount;
      return {
        ...entry,
        runningBalance,
      };
    });

    return {
      party: { id: party.id, name: party.name, phone: party.phone, balance: party.balance },
      statement,
      closingBalance: runningBalance,
    };
  }

  // ─── TRIAL BALANCE ─────────────────────────────────────
  async getTrialBalance(businessId: string, query: Record<string, any>) {
    const { start, end } = getFinancialYearDates(query.fyStart ? Number(query.fyStart) : 4);
    // Whole-day bounds — see toStartOfDay/toEndOfDay. Without this the end date
    // itself (usually today) was excluded from the report.
    const startDate = toStartOfDay(query.startDate ? new Date(query.startDate) : start);
    const endDate = toEndOfDay(query.endDate ? new Date(query.endDate) : end);

    const result = await prisma.$queryRaw<Array<{
      account_type: string; total_debit: number; total_credit: number;
    }>>`
      SELECT 
        account_type,
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credit
      FROM ledger_entries
      WHERE business_id = ${businessId}
        AND entry_date >= ${startDate.toISOString()}::timestamp
        AND entry_date <= ${endDate.toISOString()}::timestamp
      GROUP BY account_type
      ORDER BY account_type
    `;

    let totalDebit = 0;
    let totalCredit = 0;
    const accounts = result.map((r: any) => {
      totalDebit += Number(r.total_debit);
      totalCredit += Number(r.total_credit);
      return {
        accountType: r.account_type,
        debit: Number(r.total_debit),
        credit: Number(r.total_credit),
        balance: Number(r.total_debit) - Number(r.total_credit),
      };
    });

    return { accounts, totalDebit, totalCredit, period: { startDate, endDate } };
  }

  // ─── PROFIT & LOSS ─────────────────────────────────────
  async getProfitAndLoss(businessId: string, query: Record<string, any>) {
    const { start, end } = getFinancialYearDates(query.fyStart ? Number(query.fyStart) : 4);
    // Whole-day bounds — see toStartOfDay/toEndOfDay. Without this the end date
    // itself (usually today) was excluded from the report.
    const startDate = toStartOfDay(query.startDate ? new Date(query.startDate) : start);
    const endDate = toEndOfDay(query.endDate ? new Date(query.endDate) : end);

    const [salesTotal, purchaseTotal, expenseTotal, incomeTotal] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: {
          business_id: businessId,
          account_type: 'SALES',
          entry_date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      // Purchases: the debit leg of stock coming in. This aggregated
      // `account_type: 'PURCHASE'`, which the purchase flow never writes — a
      // purchase records INVENTORY/DEBIT and PARTY_PAYABLE/CREDIT (verified
      // against ledger_entries). So this figure was always ₹0 and Gross Profit
      // was reported as the whole of Sales. PURCHASE is kept in the list in
      // case an entry is booked against it manually.
      prisma.ledgerEntry.aggregate({
        where: {
          business_id: businessId,
          account_type: { in: ['PURCHASE', 'INVENTORY'] },
          entry_type: 'DEBIT',
          entry_date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: {
          business_id: businessId,
          account_type: 'EXPENSE',
          entry_date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: {
          business_id: businessId,
          account_type: 'INCOME',
          entry_date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
    ]);

    const sales = Number(salesTotal._sum.amount || 0);
    const purchases = Number(purchaseTotal._sum.amount || 0);
    const expenses = Number(expenseTotal._sum.amount || 0);
    const income = Number(incomeTotal._sum.amount || 0);
    const grossProfit = sales - purchases;
    const netProfit = grossProfit + income - expenses;

    return {
      sales,
      purchases,
      grossProfit,
      expenses,
      otherIncome: income,
      netProfit,
      period: { startDate, endDate },
    };
  }

  // ─── BALANCE SHEET ─────────────────────────────────────
  async getBalanceSheet(businessId: string, query: Record<string, any>) {
    const { end } = getFinancialYearDates(query.fyStart ? Number(query.fyStart) : 4);
    const asOnDate = toEndOfDay(
      query.asOnDate ? new Date(query.asOnDate) : (query.endDate ? new Date(query.endDate) : end),
    );

    // 1) Aggregate all ledger entries up to the as-on date by account type
    interface AccountSum { account_type: string; total_debit: number; total_credit: number }
    const accountSums: AccountSum[] = await prisma.$queryRaw`
      SELECT
        account_type,
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credit
      FROM ledger_entries
      WHERE business_id = ${businessId}
        AND entry_date <= ${asOnDate.toISOString()}::timestamp
      GROUP BY account_type
    `;

    const balanceByType: Record<string, number> = {};
    for (const row of accountSums) {
      balanceByType[row.account_type] = Number(row.total_debit) - Number(row.total_credit);
    }

    // 2) Inventory valuation AS OF the report date. Using Lot.available_qty
    // (a live column) made every historical balance sheet mix "then" cash
    // figures with "now" stock. Reconstruct: for each lot created on or
    // before the date, initial quantity minus what had been sold from it by
    // that date (via sale_lots joined to the sale's date).
    interface LotAsOf { id: string; initial_qty: number; purchase_rate: number }
    const lotsAsOf: LotAsOf[] = await prisma.$queryRaw`
      SELECT id, initial_qty, purchase_rate
      FROM lots
      WHERE business_id = ${businessId}
        AND status != 'CANCELLED'
        AND created_at <= ${asOnDate.toISOString()}::timestamp
    `;
    interface SoldRow { lot_id: string; sold: number }
    const soldRows: SoldRow[] = await prisma.$queryRaw`
      SELECT sl.lot_id, COALESCE(SUM(sl.quantity_sold), 0) as sold
      FROM sale_lots sl
      JOIN sales s ON s.id = sl.sale_id
      WHERE s.business_id = ${businessId}
        AND s.status = 'ACTIVE'
        AND s.sale_date <= ${asOnDate.toISOString()}::timestamp
      GROUP BY sl.lot_id
    `;
    const soldByLot: Record<string, number> = {};
    for (const r of soldRows) soldByLot[r.lot_id] = Number(r.sold);
    const inventoryValue = lotsAsOf.reduce((sum, lot) => {
      const remaining = Math.max(0, Number(lot.initial_qty) - (soldByLot[lot.id] || 0));
      return sum + remaining * Number(lot.purchase_rate);
    }, 0);

    // 3) Party balances AS OF the report date, reconstructed from the party
    // ledger legs instead of the live Party.balance column.
    //
    // SIGN CONVENTION (set by the writers, do not change without a data migration):
    //   balance < 0  =>  they owe us      => RECEIVABLE (asset)
    //   balance > 0  =>  we owe them      => PAYABLE (liability)
    // Per-entry deltas as the writers apply them:
    //   document legs (purchase/sale/payment/cutter/expense on the PARTY_*
    //   accounts): CREDIT => +amount, DEBIT => -amount — this single rule
    //   covers both account types (sale = RECEIVABLE/DEBIT/-, purchase =
    //   PAYABLE/CREDIT/+, payment-in = RECEIVABLE/CREDIT/+, payment-out =
    //   PAYABLE/DEBIT/-).
    //   manual entries move the balance the OPPOSITE way (DEBIT => +amount,
    //   see createManualEntry), for any account type when a party is attached.
    // Opening balances have no ledger leg at all, so they are added from the
    // party row (parties created after the date are excluded entirely).
    interface PartyAsOf { id: string; name: string; opening_balance: number; delta: number | null }
    const partyRows: PartyAsOf[] = await prisma.$queryRaw`
      SELECT p.id, p.name, p.opening_balance,
        (SELECT SUM(CASE WHEN le.reference_type = 'manual'
                    THEN CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END
                    ELSE CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END END)
           FROM ledger_entries le
          WHERE le.party_id = p.id
            AND le.business_id = ${businessId}
            AND le.entry_date <= ${asOnDate.toISOString()}::timestamp
            AND (le.reference_type = 'manual' OR le.account_type IN ('PARTY_PAYABLE', 'PARTY_RECEIVABLE'))
        ) as delta
      FROM parties p
      WHERE p.business_id = ${businessId}
        AND p.is_active = true
        AND p.created_at <= ${asOnDate.toISOString()}::timestamp
    `;
    const partyBalancesAsOf = partyRows
      .map(p => ({ name: p.name, balance: Number(p.opening_balance) + Number(p.delta || 0) }))
      .filter(p => Math.abs(p.balance) > 0.005);

    const receivables = partyBalancesAsOf
      .filter(p => p.balance < 0)
      .map(p => ({ name: p.name, amount: Math.abs(p.balance) }));
    const payables = partyBalancesAsOf
      .filter(p => p.balance > 0)
      .map(p => ({ name: p.name, amount: p.balance }));

    const totalReceivable = receivables.reduce((s: number, r: { amount: number }) => s + r.amount, 0);
    const totalPayable = payables.reduce((s: number, p: { amount: number }) => s + p.amount, 0);

    // 4) Cash & Bank
    const cashBalance = balanceByType['CASH'] || 0;
    const bankBalance = balanceByType['BANK'] || 0;

    // 5) Compute P&L for the period (retained earnings)
    const salesCredit = accountSums.find((r: AccountSum) => r.account_type === 'SALES');
    const purchaseDebit = accountSums.find((r: AccountSum) => r.account_type === 'PURCHASE');
    const expenseDebit = accountSums.find((r: AccountSum) => r.account_type === 'EXPENSE');
    const incomeCredit = accountSums.find((r: AccountSum) => r.account_type === 'INCOME');

    const totalSales = salesCredit ? Number(salesCredit.total_credit) - Number(salesCredit.total_debit) : 0;
    const totalPurchases = purchaseDebit ? Number(purchaseDebit.total_debit) - Number(purchaseDebit.total_credit) : 0;
    const totalExpenses = expenseDebit ? Number(expenseDebit.total_debit) - Number(expenseDebit.total_credit) : 0;
    const otherIncome = incomeCredit ? Number(incomeCredit.total_credit) - Number(incomeCredit.total_debit) : 0;
    const retainedEarnings = totalSales - totalPurchases - totalExpenses + otherIncome;

    // ── Build the balance sheet structure ──
    const assets = {
      currentAssets: [
        { name: 'Cash in Hand', amount: Math.max(cashBalance, 0) },
        { name: 'Bank Accounts', amount: Math.max(bankBalance, 0) },
        { name: 'Accounts Receivable (Sundry Debtors)', amount: totalReceivable },
        { name: 'Inventory (Stock in Hand)', amount: inventoryValue },
      ],
      totalCurrentAssets: Math.max(cashBalance, 0) + Math.max(bankBalance, 0) + totalReceivable + inventoryValue,
    };

    const liabilities = {
      currentLiabilities: [
        { name: 'Accounts Payable (Sundry Creditors)', amount: totalPayable },
        ...(cashBalance < 0 ? [{ name: 'Cash Overdrawn', amount: Math.abs(cashBalance) }] : []),
        ...(bankBalance < 0 ? [{ name: 'Bank Overdraft', amount: Math.abs(bankBalance) }] : []),
      ],
      totalCurrentLiabilities: totalPayable + (cashBalance < 0 ? Math.abs(cashBalance) : 0) + (bankBalance < 0 ? Math.abs(bankBalance) : 0),
    };

    const equity = {
      items: [
        { name: 'Retained Earnings (P&L)', amount: retainedEarnings },
      ],
      totalEquity: retainedEarnings,
    };

    // Balance check: Assets = Liabilities + Equity.
    // The difference used to be back-plugged into an equity line called
    // "Capital / Opening Balance", which made the frontend's "Balanced" banner
    // mathematically guaranteed — it could never warn about books that don't
    // tie out. Report the residual separately instead so a real imbalance is
    // visible; a genuine opening-capital figure belongs in a real CAPITAL
    // account, not in the plug.
    const diff = assets.totalCurrentAssets - liabilities.totalCurrentLiabilities - equity.totalEquity;

    return {
      asOnDate,
      assets,
      liabilities,
      equity,
      totalAssets: assets.totalCurrentAssets,
      totalLiabilitiesAndEquity: liabilities.totalCurrentLiabilities + equity.totalEquity,
      unreconciledDifference: Math.abs(diff) > 0.01 ? diff : 0,
    };
  }

  // ─── OUTSTANDING SUMMARY ───────────────────────────────
  async getOutstandingSummary(businessId: string, type?: 'receivable' | 'payable') {
    const partyWhere: any = { business_id: businessId, is_active: true };

    // See the sign convention note in getBalanceSheet: negative = receivable.
    if (type === 'receivable') {
      partyWhere.balance = { lt: 0 };
    } else if (type === 'payable') {
      partyWhere.balance = { gt: 0 };
    } else {
      partyWhere.balance = { not: 0 };
    }

    const parties = await prisma.party.findMany({
      where: partyWhere,
      select: {
        id: true, name: true, phone: true, type: true, balance: true,
      },
      orderBy: { balance: 'desc' },
    });

    // Negative = receivable, positive = payable (see getBalanceSheet).
    const totalReceivable = parties
      .filter((p: any) => Number(p.balance) < 0)
      .reduce((sum: number, p: any) => sum + Math.abs(Number(p.balance)), 0);

    const totalPayable = parties
      .filter((p: any) => Number(p.balance) > 0)
      .reduce((sum: number, p: any) => sum + Number(p.balance), 0);

    return {
      parties,
      totalReceivable,
      totalPayable,
      netOutstanding: totalReceivable - totalPayable,
    };
  }

  // ─── DAY BOOK ──────────────────────────────────────────
  async getDayBook(businessId: string, date?: string, from?: string, to?: string) {
    let startOfDay: Date;
    let endOfDay: Date;

    if (from && to) {
      // Date range mode (used by ReportsPage)
      startOfDay = new Date(from);
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
    } else {
      // Single date mode (legacy)
      const targetDate = date ? new Date(date) : new Date();
      startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        business_id: businessId,
        entry_date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        party: { select: { id: true, name: true } },
        purchase: { select: { id: true, purchase_number: true } },
        sale: { select: { id: true, sale_number: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    // Map to the shape expected by the frontend DayBookEntry interface
    return entries.map((e: any) => ({
      id: e.id,
      date: e.entry_date,
      // `e.description` does not exist on LedgerEntry — dead fallback.
      narration: e.narration || '',
      debit: e.entry_type === 'DEBIT' ? Number(e.amount) : 0,
      credit: e.entry_type === 'CREDIT' ? Number(e.amount) : 0,
      // The field is `reference_type`, not `ref_type`. Reading the wrong name
      // meant every Day Book row fell through to the grey 'JOURNAL' fallback,
      // the PURCHASE/SALE/PAYMENT colour coding was unreachable, and the CSV
      // export labelled every row 'JOURNAL' — a purchase was indistinguishable
      // from a payment. Stored lower-case, so upper-case it to match the
      // frontend's colour-map keys.
      type: e.reference_type ? String(e.reference_type).toUpperCase() : 'JOURNAL',
      party_name: e.party?.name,
    }));
  }
}

export const ledgerService = new LedgerService();
