import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, generateReferenceNumber, getPrismaClient, ConflictError, NotFoundError } from '../shared';

/**
 * Assert every id referenced by a purchase payload belongs to the business.
 * partyId/itemId/cutterId/expenseTypeId were previously used unscoped in
 * balance/stock writes — a guessed UUID from another tenant was a
 * cross-tenant write.
 */
async function assertPurchaseRefsOwned(
  tx: any,
  businessId: string,
  data: {
    partyId?: string;
    items?: { itemId: string }[];
    expenses?: { expenseTypeId: string }[];
    cutterTransactions?: { cutterId: string }[];
  },
): Promise<void> {
  if (data.partyId) {
    const party = await tx.party.findFirst({
      where: { id: data.partyId, business_id: businessId },
      select: { id: true },
    });
    if (!party) throw new NotFoundError('Party');
  }
  const itemIds = [...new Set((data.items ?? []).map(i => i.itemId))];
  if (itemIds.length) {
    const count = await tx.inventoryItem.count({ where: { id: { in: itemIds }, business_id: businessId } });
    if (count !== itemIds.length) throw new NotFoundError('Inventory item');
  }
  const cutterIds = [...new Set((data.cutterTransactions ?? []).map(c => c.cutterId))];
  if (cutterIds.length) {
    const count = await tx.cutter.count({ where: { id: { in: cutterIds }, business_id: businessId } });
    if (count !== cutterIds.length) throw new NotFoundError('Cutter');
  }
  const expenseTypeIds = [...new Set((data.expenses ?? []).map(e => e.expenseTypeId))];
  if (expenseTypeIds.length) {
    const count = await tx.expenseType.count({ where: { id: { in: expenseTypeIds }, business_id: businessId } });
    if (count !== expenseTypeIds.length) throw new NotFoundError('Expense type');
  }
}

const prisma = getPrismaClient();
const logger = createLogger('purchase-service');

interface PurchaseItemInput {
  itemId: string;
  quantity: number;
  rate: number;
  unit?: string;
  notes?: string;
  lotNumber?: string;
}

interface PurchaseExpenseInput {
  expenseTypeId: string;
  expenseCategory: 'DIRECT' | 'INDIRECT';
  amount: number;
  isPaid?: boolean;
  receiptUrl?: string;
  notes?: string;
}

interface CutterTxInput {
  cutterId: string;
  quantity: number;
  rate: number;
  isPaid?: boolean;
  receiptUrl?: string;
  notes?: string;
}

interface PaymentInput {
  paymentMode: string;
  amount: number;
  paymentDate?: string;
  transactionRef?: string;
  receiptUrl?: string;
  notes?: string;
}

interface ReminderInput {
  remindOn: string;  // ISO date string
  amount?: number;   // 0 or undefined = full balance
  note?: string;
}

export class PurchaseService {
  /**
   * Create a complete purchase with items, expenses, cutters, lots, payments
   * Handles: multi-gadi, multi-lot, multi-expense, cutter cost, inventory, ledger
   */
  async createPurchase(businessId: string, _userId: string, data: {
    shopId?: string;
    partyId: string;
    gadiNumber?: string;
    billNumber?: string;
    purchaseDate?: string;
    items: PurchaseItemInput[];
    expenses: PurchaseExpenseInput[];
    cutterTransactions: CutterTxInput[];
    payments: PaymentInput[];
    notes?: string;
    gstMode?: string;
    gstValue?: number;
    gstAmount?: number;
    discount?: number;
    roundOff?: number;
    reminderDate?: string;
    reminderAmount?: number;
    reminders?: ReminderInput[];
  }) {
    return prisma.$transaction(async (tx: any) => {
      // Every referenced id must belong to the caller's business. These
      // writes increment party balances and mutate inventory rows keyed only
      // by id — without the checks, a UUID from another tenant is a
      // cross-tenant write.
      await assertPurchaseRefsOwned(tx, businessId, data);

      const purchaseNumber = generateReferenceNumber('PUR', businessId);
      const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date();

      // Calculate subtotal from items
      let subtotal = 0;
      for (const item of data.items) {
        subtotal += item.quantity * item.rate;
      }

      // Calculate expenses
      let directExpense = 0;
      let indirectExpense = 0;
      for (const exp of data.expenses) {
        if (exp.expenseCategory === 'DIRECT') {
          directExpense += exp.amount;
        } else {
          indirectExpense += exp.amount;
        }
      }

      // Calculate cutter cost
      let cutterCost = 0;
      for (const ct of data.cutterTransactions) {
        cutterCost += ct.quantity * ct.rate;
      }

      // Calculate GST
      let gstAmount = 0;
      if (data.gstMode && data.gstMode !== 'NONE') {
        if (data.gstAmount !== undefined && data.gstAmount !== null) {
          gstAmount = data.gstAmount;
        } else if (data.gstMode === 'AMOUNT') {
          gstAmount = data.gstValue || 0;
        } else if (data.gstMode === 'PERCENT' && data.gstValue) {
          gstAmount = Math.round(subtotal * data.gstValue / 100 * 100) / 100;
        }
      }

      const discount = data.discount || 0;
      const roundOff = data.roundOff || 0;
      const totalAmount = subtotal + directExpense + indirectExpense + cutterCost + gstAmount - discount + roundOff;

      // Party-facing amount: what the supplier is actually owed
      // Formula: Subtotal + GST - Discount + Round-Off
      // Excludes: expenses (paid to transport/labor) and cutter costs (paid to cutters)
      const partyAmount = subtotal + gstAmount - discount + roundOff;

      // Calculate paid amount
      let paidAmount = 0;
      for (const payment of data.payments) {
        paidAmount += payment.amount;
      }
      // balance_amount is PARTY-FACING (what the supplier is still owed).
      // Using totalAmount here while payment_status used partyAmount produced
      // "PAID" badges next to a red balance and a Record Payment button that
      // paid the supplier money owed to transporters/cutters. Expense and
      // cutter payables live on their own parties/ledger rows.
      const balanceAmount = Math.max(0, partyAmount - paidAmount);
      // Party balance = what we still owe the supplier (excludes expenses/cutter)
      const partyBalanceAmount = Math.max(0, partyAmount - paidAmount);

      // Determine payment status (based on party-facing amount)
      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CREDIT' | 'OVERPAID' = 'UNPAID';
      if (paidAmount >= partyAmount) paymentStatus = 'PAID';
      else if (paidAmount > 0) paymentStatus = 'PARTIAL';
      else if (data.payments.some(p => p.paymentMode === 'CREDIT')) paymentStatus = 'CREDIT';

      // 1. Create purchase record
      const purchase = await tx.purchase.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          shop_id: data.shopId,
          party_id: data.partyId,
          purchase_number: purchaseNumber,
          purchase_date: purchaseDate,
          gadi_number: data.gadiNumber,
          bill_number: data.billNumber,
          subtotal: new Prisma.Decimal(subtotal),
          direct_expense: new Prisma.Decimal(directExpense),
          indirect_expense: new Prisma.Decimal(indirectExpense),
          cutter_cost: new Prisma.Decimal(cutterCost),
          gst_mode: data.gstMode || null,
          gst_value: data.gstValue ? new Prisma.Decimal(data.gstValue) : null,
          gst_amount: new Prisma.Decimal(gstAmount),
          discount: new Prisma.Decimal(discount),
          round_off: new Prisma.Decimal(roundOff),
          total_amount: new Prisma.Decimal(totalAmount),
          paid_amount: new Prisma.Decimal(paidAmount),
          balance_amount: new Prisma.Decimal(balanceAmount),
          payment_status: paymentStatus,
          reminder_date: data.reminderDate ? new Date(data.reminderDate) : null,
          reminder_amount: data.reminderAmount != null ? new Prisma.Decimal(data.reminderAmount) : null,
          notes: data.notes,
        },
      });

      // 2. Create purchase items + lots + inventory transactions
      for (const item of data.items) {
        const itemAmount = item.quantity * item.rate;

        // Create purchase item
        await tx.purchaseItem.create({
          data: {
            id: uuidv4(),
            purchase_id: purchase.id,
            item_id: item.itemId,
            quantity: new Prisma.Decimal(item.quantity),
            rate: new Prisma.Decimal(item.rate),
            amount: new Prisma.Decimal(itemAmount),
            unit: item.unit || 'KG',
            notes: item.notes,
          },
        });

        // Create lot
        const lotNumber = item.lotNumber || generateReferenceNumber('LOT', businessId);
        const lot = await tx.lot.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            item_id: item.itemId,
            purchase_id: purchase.id,
            lot_number: lotNumber,
            initial_qty: new Prisma.Decimal(item.quantity),
            available_qty: new Prisma.Decimal(item.quantity),
            sold_qty: new Prisma.Decimal(0),
            purchase_rate: new Prisma.Decimal(item.rate),
            unit: item.unit || 'KG',
            status: 'AVAILABLE',
          },
        });

        // Create lot history entry
        await tx.lotHistory.create({
          data: {
            id: uuidv4(),
            lot_id: lot.id,
            reference_type: 'purchase',
            reference_id: purchase.id,
            quantity_change: new Prisma.Decimal(item.quantity),
            balance_after: new Prisma.Decimal(item.quantity),
            notes: `Purchase ${purchaseNumber}`,
          },
        });

        // Update inventory - quantity_in
        const existingItem = await tx.inventoryItem.findUnique({
          where: { id: item.itemId },
        });

        if (existingItem) {
          const newQtyIn = Number(existingItem.quantity_in) + item.quantity;
          const newStock = Number(existingItem.current_stock) + item.quantity;

          await tx.inventoryItem.update({
            where: { id: item.itemId },
            data: {
              quantity_in: new Prisma.Decimal(newQtyIn),
              current_stock: new Prisma.Decimal(newStock),
            },
          });

          // Create inventory transaction
          await tx.inventoryTransaction.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              item_id: item.itemId,
              txn_type: 'IN',
              reference_type: 'purchase',
              reference_id: purchase.id,
              quantity: new Prisma.Decimal(item.quantity),
              balance_after: new Prisma.Decimal(newStock),
              notes: `Purchase ${purchaseNumber}`,
            },
          });
        }
      }

      // 3. Create expenses + ledger entries for unpaid ones
      for (const expense of data.expenses) {
        const isPaid = expense.isPaid !== false; // default true
        await tx.purchaseExpense.create({
          data: {
            id: uuidv4(),
            purchase_id: purchase.id,
            expense_type_id: expense.expenseTypeId,
            expense_category: expense.expenseCategory,
            amount: new Prisma.Decimal(expense.amount),
            is_paid: isPaid,
            receipt_url: expense.receiptUrl || null,
            notes: expense.notes,
          },
        });

        // If unpaid — create a payable ledger entry. NOT pinned to the
        // supplier: the expense is owed to a transporter/vendor, not the
        // supplier, and the supplier's balance deliberately excludes expenses —
        // pinning the leg to the supplier made their ledger and balance
        // permanently disagree by the expense amount. purchase_id + narration
        // keep it traceable.
        if (!isPaid) {
          await tx.ledgerEntry.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              party_id: null,
              purchase_id: purchase.id,
              entry_date: purchaseDate,
              account_type: 'PARTY_PAYABLE',
              entry_type: 'CREDIT',
              amount: new Prisma.Decimal(expense.amount),
              narration: `Unpaid expense (${expense.expenseCategory}) for purchase ${purchaseNumber}`,
              reference_type: 'expense',
              reference_id: purchase.id,
            },
          });
        }
      }

      // 4. Create cutter transactions + ledger entries for unpaid cutters
      for (const ct of data.cutterTransactions) {
        const ctAmount = ct.quantity * ct.rate;
        const isPaid = ct.isPaid !== false; // default true
        await tx.cutterTransaction.create({
          data: {
            id: uuidv4(),
            purchase_id: purchase.id,
            cutter_id: ct.cutterId,
            quantity: new Prisma.Decimal(ct.quantity),
            rate: new Prisma.Decimal(ct.rate),
            amount: new Prisma.Decimal(ctAmount),
            is_paid: isPaid,
            receipt_url: ct.receiptUrl || null,
            notes: ct.notes,
          },
        });

        // If unpaid — create a cutter payable ledger entry
        if (!isPaid) {
          // Find cutter and its linked unified Party (type=CUTTER)
          const cutter = await tx.cutter.findUnique({
            where: { id: ct.cutterId },
            select: { id: true, name: true, party_id: true },
          });
          await tx.ledgerEntry.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              // Link to the cutter's unified Party so this entry shows up
              // in the Party ledger view for the cutter.
              party_id: cutter?.party_id || null,
              purchase_id: purchase.id,
              entry_date: purchaseDate,
              account_type: 'PARTY_PAYABLE',
              entry_type: 'CREDIT',
              amount: new Prisma.Decimal(ctAmount),
              narration: `Unpaid cutter cost: ${cutter?.name || ct.cutterId} for purchase ${purchaseNumber}`,
              reference_type: 'cutter',
              reference_id: purchase.id,
            },
          });

          // Increment the cutter Party's payable balance
          if (cutter?.party_id) {
            await tx.party.update({
              where: { id: cutter.party_id },
              data: { balance: { increment: new Prisma.Decimal(ctAmount) } },
            });
          }
        }
      }

      // 5. Create payments
      for (const payment of data.payments) {
        if (payment.paymentMode === 'CREDIT') continue;

        await tx.payment.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'PURCHASE',
            reference_id: purchase.id,
            payer_party_id: null,
            payee_party_id: data.partyId,
            payment_mode: payment.paymentMode as any,
            amount: new Prisma.Decimal(payment.amount),
            payment_date: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            transaction_ref: payment.transactionRef,
            remaining_balance: new Prisma.Decimal(balanceAmount),
            status: paymentStatus,
            notes: payment.notes,
            receipt_url: payment.receiptUrl || null,
          },
        });
      }

      // 6. Create ledger entries (double-entry)
      // Dr Inventory (full total including expenses/cutter for cost tracking)
      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId,
          purchase_id: purchase.id,
          entry_date: purchaseDate,
          account_type: 'INVENTORY',
          entry_type: 'DEBIT',
          amount: new Prisma.Decimal(totalAmount),
          narration: `Purchase ${purchaseNumber} from party`,
          reference_type: 'purchase',
          reference_id: purchase.id,
        },
      });

      // Cr Party Payable — only the party-facing amount (subtotal + gst - discount + roundoff)
      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId,
          purchase_id: purchase.id,
          entry_date: purchaseDate,
          account_type: 'PARTY_PAYABLE',
          entry_type: 'CREDIT',
          amount: new Prisma.Decimal(partyAmount),
          narration: `Payable for purchase ${purchaseNumber}`,
          reference_type: 'purchase',
          reference_id: purchase.id,
        },
      });

      // If payment made, Dr Party Payable / Cr Cash/Bank
      if (paidAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            party_id: data.partyId,
            purchase_id: purchase.id,
            entry_date: purchaseDate,
            account_type: 'PARTY_PAYABLE',
            entry_type: 'DEBIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Payment for purchase ${purchaseNumber}`,
            reference_type: 'payment',
            reference_id: purchase.id,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            party_id: data.partyId,
            purchase_id: purchase.id,
            entry_date: purchaseDate,
            account_type: 'CASH',
            entry_type: 'CREDIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Cash/Bank paid for purchase ${purchaseNumber}`,
            reference_type: 'payment',
            reference_id: purchase.id,
          },
        });
      }

      // Update party balance (only the party-facing amount, excluding expenses/cutter)
      await tx.party.update({
        where: { id: data.partyId },
        data: {
          balance: {
            increment: new Prisma.Decimal(partyBalanceAmount),
          },
        },
      });

      logger.info('Purchase created', {
        purchaseId: purchase.id,
        purchaseNumber,
        businessId,
        total: totalAmount,
        items: data.items.length,
        lots: data.items.length,
      });

      // 7. Create payment reminders
      const reminders = data.reminders && data.reminders.length > 0
        ? data.reminders
        : data.reminderDate
          ? [{ remindOn: data.reminderDate, amount: data.reminderAmount, note: undefined }]
          : [];

      for (const r of reminders) {
        await tx.paymentReminder.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'purchase',
            reference_id: purchase.id,
            remind_on: new Date(r.remindOn),
            amount: r.amount != null && r.amount > 0 ? new Prisma.Decimal(r.amount) : null,
            note: r.note || null,
          },
        });
      }

      // Return full purchase with relations
      const result = await tx.purchase.findUnique({
        where: { id: purchase.id },
        include: {
          party: true,
          shop: true,
          items: { include: { item: true } },
          expenses: { include: { expense_type: true } },
          cutter_transactions: { include: { cutter: true } },
          lots: true,
        },
      });
      const payments = await tx.payment.findMany({
        where: { reference_type: 'PURCHASE', reference_id: purchase.id },
      });
      const fetchedReminders = await tx.paymentReminder.findMany({
        where: { reference_type: 'purchase', reference_id: purchase.id },
        orderBy: { remind_on: 'asc' },
      });
      return { ...result, payments, reminders: fetchedReminders };
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  /**
   * Get purchase by ID with full details
   */
  async getPurchaseById(purchaseId: string, businessId: string) {
    const purchase = await prisma.purchase.findFirst({
      // Soft-deleted purchases stay in the table as CANCELLED; without this
      // filter they remained viewable (and editable, dying with a 500).
      where: { id: purchaseId, business_id: businessId, status: { not: 'CANCELLED' } },
      include: {
        party: true,
        shop: true,
        items: { include: { item: true } },
        expenses: { include: { expense_type: true } },
        cutter_transactions: { include: { cutter: true } },
        lots: { include: { history: { orderBy: { created_at: 'desc' } } } },
        attachments: true,
        ledger_entries: true,
      },
    });
    if (!purchase) return null;
    const [payments, reminders] = await Promise.all([
      prisma.payment.findMany({ where: { reference_type: 'PURCHASE', reference_id: purchaseId } }),
      prisma.paymentReminder.findMany({ where: { reference_type: 'purchase', reference_id: purchaseId }, orderBy: { remind_on: 'asc' } }),
    ]);
    return { ...purchase, payments, reminders };
  }

  /**
   * List purchases with filters and pagination
   */
  async listPurchases(businessId: string, filters: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    date_from?: string;
    date_to?: string;
    partyId?: string;
    party_id?: string;
    gadiNumber?: string;
    gadi_number?: string;
    paymentStatus?: string;
    payment_status?: string;
    search?: string;
    amount_from?: string | number;
    amount_to?: string | number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const startDate = filters.startDate || filters.date_from;
    const endDate = filters.endDate || filters.date_to;
    const partyId = filters.partyId || filters.party_id;
    const gadiNumber = filters.gadiNumber || filters.gadi_number;
    const paymentStatus = filters.paymentStatus || filters.payment_status;

    const where: any = {
      business_id: businessId,
      status: 'ACTIVE',
    };

    if (startDate || endDate) {
      where.purchase_date = {};
      if (startDate) where.purchase_date.gte = new Date(startDate);
      if (endDate) {
        // include the whole day for the end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.purchase_date.lte = end;
      }
    }
    if (partyId) where.party_id = partyId;
    if (gadiNumber) where.gadi_number = { contains: gadiNumber, mode: 'insensitive' };
    if (paymentStatus && paymentStatus !== '__all__') where.payment_status = paymentStatus;
    if (filters.search) {
      where.OR = [
        { purchase_number: { contains: filters.search, mode: 'insensitive' } },
        { bill_number: { contains: filters.search, mode: 'insensitive' } },
        { gadi_number: { contains: filters.search, mode: 'insensitive' } },
        { party: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    // AdvancedFilters emits amount_min/amount_max; accept both spellings.
    filters.amount_from = filters.amount_from ?? (filters as any).amount_min;
    filters.amount_to = filters.amount_to ?? (filters as any).amount_max;
    if (filters.amount_from || filters.amount_to) {
      where.total_amount = {};
      if (filters.amount_from) where.total_amount.gte = Number(filters.amount_from);
      if (filters.amount_to) where.total_amount.lte = Number(filters.amount_to);
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, phone: true } },
          items: { include: { item: { select: { id: true, name: true } } } },
          _count: { select: { attachments: true } },
        },
        orderBy: { [filters.sortBy || 'created_at']: filters.sortOrder || 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({ where }),
    ]);

    return {
      data: purchases,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Delete purchase (soft delete with reversal)
   */
  async deletePurchase(purchaseId: string, businessId: string) {
    return prisma.$transaction(async (tx: any) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, business_id: businessId, status: 'ACTIVE' },
        include: { items: true, lots: true, cutter_transactions: true },
      });

      if (!purchase) throw new NotFoundError('Purchase');

      // Refuse deletion once any lot has been sold from: reversing the full
      // original quantity would understate stock by the already-sold units
      // and orphan the SaleLot rows.
      const soldLots = purchase.lots.filter((l: any) => Number(l.sold_qty) > 0);
      if (soldLots.length > 0) {
        throw new ConflictError(
          `Cannot delete this purchase: ${soldLots.length} of its lot(s) already have sales recorded. Delete or adjust those sales first.`,
        );
      }

      // Reverse inventory
      for (const item of purchase.items) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: item.item_id } });
        if (invItem) {
          const newQtyIn = Math.max(0, Number(invItem.quantity_in) - Number(item.quantity));
          const newStock = Math.max(0, Number(invItem.current_stock) - Number(item.quantity));

          await tx.inventoryItem.update({
            where: { id: item.item_id },
            data: {
              quantity_in: new Prisma.Decimal(newQtyIn),
              current_stock: new Prisma.Decimal(newStock),
            },
          });

          // Reversal transaction
          await tx.inventoryTransaction.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              item_id: item.item_id,
              txn_type: 'REVERSAL',
              reference_type: 'purchase_delete',
              reference_id: purchaseId,
              quantity: item.quantity,
              balance_after: new Prisma.Decimal(newStock),
              notes: `Reversal: Purchase ${purchase.purchase_number} deleted`,
            },
          });
        }
      }

      // Cancel lots
      for (const lot of purchase.lots) {
        await tx.lot.update({
          where: { id: lot.id },
          data: { status: 'CANCELLED', available_qty: 0 },
        });
      }

      // Reverse cutter party balances for unpaid cutter rows before removing
      // them — deleting the rows without this leaves the inflated payable on
      // the cutter's party forever.
      for (const ct of purchase.cutter_transactions) {
        if (!ct.is_paid) {
          const cutter = await tx.cutter.findUnique({
            where: { id: ct.cutter_id },
            select: { party_id: true },
          });
          if (cutter?.party_id) {
            await tx.party.update({
              where: { id: cutter.party_id },
              data: { balance: { decrement: ct.amount } },
            });
          }
        }
      }

      // Remove cutter transactions tied to this purchase (cascade-sync)
      await tx.cutterTransaction.deleteMany({ where: { purchase_id: purchaseId } });

      // Remove ledger entries created by this purchase (party payables, cutter payables, expense payables)
      await tx.ledgerEntry.deleteMany({ where: { purchase_id: purchaseId } });

      // Remove payments and reminders tied to this purchase (same cleanup as
      // updatePurchase) — the soft-delete otherwise left them dangling.
      await tx.payment.deleteMany({ where: { reference_id: purchaseId, reference_type: 'PURCHASE' } });
      await tx.paymentReminder.deleteMany({ where: { reference_type: 'purchase', reference_id: purchaseId } });

      // Reverse party balance (only the party-facing portion)
      // Party amount = subtotal + gst - discount + roundoff (excludes expenses/cutter)
      const purchasePartyAmount = Number(purchase.subtotal) + Number(purchase.gst_amount) - Number(purchase.discount) + Number(purchase.round_off);
      const purchasePartyBalance = Math.max(0, purchasePartyAmount - Number(purchase.paid_amount));
      await tx.party.update({
        where: { id: purchase.party_id },
        data: {
          balance: { decrement: new Prisma.Decimal(purchasePartyBalance) },
        },
      });

      // Soft delete purchase
      return tx.purchase.update({
        where: { id: purchaseId },
        data: { status: 'CANCELLED' },
      });
    });
  }

  /**
   * Get purchase dashboard stats
   */
  async getDashboard(businessId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayStats, monthStats, totalStats, recentPurchases] = await Promise.all([
      prisma.purchase.aggregate({
        where: {
          business_id: businessId,
          purchase_date: { gte: today, lt: tomorrow },
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: {
          business_id: businessId,
          purchase_date: { gte: thisMonthStart },
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: {
          business_id: businessId,
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.purchase.findMany({
        where: { business_id: businessId, status: { not: 'CANCELLED' } },
        orderBy: { purchase_date: 'desc' },
        take: 5,
        include: { party: { select: { name: true } } },
      }),
    ]);

    return {
      today: {
        count: todayStats._count,
        totalAmount: Number(todayStats._sum.total_amount || 0),
        paidAmount: Number(todayStats._sum.paid_amount || 0),
        balanceAmount: Number(todayStats._sum.balance_amount || 0),
      },
      thisMonth: {
        count: monthStats._count,
        totalAmount: Number(monthStats._sum.total_amount || 0),
        paidAmount: Number(monthStats._sum.paid_amount || 0),
        balanceAmount: Number(monthStats._sum.balance_amount || 0),
      },
      overall: {
        count: totalStats._count,
        totalAmount: Number(totalStats._sum.total_amount || 0),
        paidAmount: Number(totalStats._sum.paid_amount || 0),
        balanceAmount: Number(totalStats._sum.balance_amount || 0),
      },
      recentPurchases: recentPurchases.map((p: any) => ({
        id: p.id,
        purchaseNumber: p.purchase_number,
        date: p.purchase_date,
        partyName: p.party?.name,
        totalAmount: Number(p.total_amount),
        paymentStatus: p.payment_status,
      })),
    };
  }

  /**
   * Update an existing purchase (replace items/expenses/cutter in full)
   */
  async updatePurchase(purchaseId: string, businessId: string, _userId: string, data: {
    partyId?: string;
    gadiNumber?: string;
    billNumber?: string;
    purchaseDate?: string;
    items?: PurchaseItemInput[];
    expenses?: PurchaseExpenseInput[];
    cutterTransactions?: CutterTxInput[];
    payments?: PaymentInput[];
    notes?: string;
    gstMode?: string;
    gstValue?: number;
    gstAmount?: number;
    discount?: number;
    roundOff?: number;
    reminderDate?: string | null;
    reminderAmount?: number | null;
    reminders?: ReminderInput[];
  }) {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.purchase.findFirst({
        where: { id: purchaseId, business_id: businessId, status: 'ACTIVE' },
        include: { items: true, lots: true, cutter_transactions: true },
      });
      if (!existing) throw new NotFoundError('Purchase');

      // Refuse the edit once any lot of this purchase has been sold from:
      // this path cancels the old lots and recreates them at full quantity,
      // which would re-offer already-sold units to the lot picker and leave
      // the existing SaleLot rows pointing at a CANCELLED lot.
      const soldLots = existing.lots.filter((l: any) => Number(l.sold_qty) > 0);
      if (soldLots.length > 0) {
        throw new ConflictError(
          `Cannot edit this purchase: ${soldLots.length} of its lot(s) already have sales recorded. Delete or adjust those sales first.`,
        );
      }

      // Same cross-tenant guard as createPurchase.
      await assertPurchaseRefsOwned(tx, businessId, data);

      const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : existing.purchase_date;
      const partyId = data.partyId || existing.party_id;
      const items = data.items ?? [];
      const expenses = data.expenses ?? [];
      const cutterTransactions = data.cutterTransactions ?? [];
      const payments = data.payments ?? [];

      // Reverse old inventory
      for (const oldItem of existing.items) {
        const inv = await tx.inventoryItem.findUnique({ where: { id: oldItem.item_id } });
        if (inv) {
          await tx.inventoryItem.update({
            where: { id: oldItem.item_id },
            data: {
              quantity_in: new Prisma.Decimal(Math.max(0, Number(inv.quantity_in) - Number(oldItem.quantity))),
              current_stock: new Prisma.Decimal(Math.max(0, Number(inv.current_stock) - Number(oldItem.quantity))),
            },
          });
        }
      }
      // Cancel old lots
      for (const lot of existing.lots) {
        await tx.lot.update({ where: { id: lot.id }, data: { status: 'CANCELLED', available_qty: 0 } });
      }
      // Reverse old party balance (only the party-facing portion, excluding expenses/cutter)
      const oldPartyAmount = Number(existing.subtotal) + Number(existing.gst_amount) - Number(existing.discount) + Number(existing.round_off);
      const oldPartyBalance = Math.max(0, oldPartyAmount - Number(existing.paid_amount));
      await tx.party.update({
        where: { id: existing.party_id },
        data: { balance: { decrement: new Prisma.Decimal(oldPartyBalance) } },
      });
      // Reverse cutter party balances for the old unpaid cutter rows before
      // they are deleted and re-created — without this every save increments
      // the cutter party's payable again (double-counting on each edit).
      for (const oldCt of existing.cutter_transactions) {
        if (!oldCt.is_paid) {
          const oldCutter = await tx.cutter.findUnique({
            where: { id: oldCt.cutter_id },
            select: { party_id: true },
          });
          if (oldCutter?.party_id) {
            await tx.party.update({
              where: { id: oldCutter.party_id },
              data: { balance: { decrement: oldCt.amount } },
            });
          }
        }
      }
      // Delete old sub-records
      await tx.purchaseItem.deleteMany({ where: { purchase_id: purchaseId } });
      await tx.purchaseExpense.deleteMany({ where: { purchase_id: purchaseId } });
      await tx.cutterTransaction.deleteMany({ where: { purchase_id: purchaseId } });
      await tx.payment.deleteMany({ where: { reference_id: purchaseId, reference_type: 'PURCHASE' } });
      await tx.ledgerEntry.deleteMany({ where: { purchase_id: purchaseId } });
      await tx.paymentReminder.deleteMany({ where: { reference_type: 'purchase', reference_id: purchaseId } });

      // Recalculate
      let subtotal = 0;
      for (const item of items) subtotal += item.quantity * item.rate;
      let directExpense = 0, indirectExpense = 0;
      for (const exp of expenses) {
        if (exp.expenseCategory === 'DIRECT') directExpense += exp.amount;
        else indirectExpense += exp.amount;
      }
      let cutterCost = 0;
      for (const ct of cutterTransactions) cutterCost += ct.quantity * ct.rate;

      // Calculate GST for update
      let gstAmount = 0;
      if (data.gstMode && data.gstMode !== 'NONE') {
        if (data.gstAmount !== undefined && data.gstAmount !== null) {
          gstAmount = data.gstAmount;
        } else if (data.gstMode === 'AMOUNT') {
          gstAmount = data.gstValue || 0;
        } else if (data.gstMode === 'PERCENT' && data.gstValue) {
          gstAmount = Math.round(subtotal * data.gstValue / 100 * 100) / 100;
        }
      }

      const discount = data.discount || 0;
      const roundOff = data.roundOff || 0;
      const totalAmount = subtotal + directExpense + indirectExpense + cutterCost + gstAmount - discount + roundOff;
      // Party-facing amount (what the supplier is owed, excludes expenses/cutter)
      const partyAmount = subtotal + gstAmount - discount + roundOff;
      let paidAmount = 0;
      for (const payment of payments) paidAmount += payment.amount;
      // Party-facing, matching createPurchase — see the note there.
      const balanceAmount = Math.max(0, partyAmount - paidAmount);
      const partyBalanceAmount = Math.max(0, partyAmount - paidAmount);
      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CREDIT' | 'OVERPAID' = 'UNPAID';
      if (paidAmount >= partyAmount) paymentStatus = 'PAID';
      else if (paidAmount > 0) paymentStatus = 'PARTIAL';
      else if (payments.some(p => p.paymentMode === 'CREDIT')) paymentStatus = 'CREDIT';

      // Update purchase header
      const purchase = await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          party_id: partyId,
          purchase_date: purchaseDate,
          gadi_number: data.gadiNumber ?? existing.gadi_number,
          bill_number: data.billNumber ?? existing.bill_number,
          subtotal: new Prisma.Decimal(subtotal),
          direct_expense: new Prisma.Decimal(directExpense),
          indirect_expense: new Prisma.Decimal(indirectExpense),
          cutter_cost: new Prisma.Decimal(cutterCost),
          gst_mode: data.gstMode || null,
          gst_value: data.gstValue ? new Prisma.Decimal(data.gstValue) : null,
          gst_amount: new Prisma.Decimal(gstAmount),
          discount: new Prisma.Decimal(discount),
          round_off: new Prisma.Decimal(roundOff),
          total_amount: new Prisma.Decimal(totalAmount),
          paid_amount: new Prisma.Decimal(paidAmount),
          balance_amount: new Prisma.Decimal(balanceAmount),
          payment_status: paymentStatus,
          reminder_date: data.reminderDate !== undefined
            ? (data.reminderDate ? new Date(data.reminderDate) : null)
            : existing.reminder_date,
          reminder_amount: data.reminderAmount !== undefined
            ? (data.reminderAmount != null ? new Prisma.Decimal(data.reminderAmount) : null)
            : existing.reminder_amount,
          notes: data.notes ?? existing.notes,
        },
      });

      // Re-create items / lots / inventory
      for (const item of items) {
        const itemAmount = item.quantity * item.rate;
        await tx.purchaseItem.create({
          data: {
            id: uuidv4(),
            purchase_id: purchaseId,
            item_id: item.itemId,
            quantity: new Prisma.Decimal(item.quantity),
            rate: new Prisma.Decimal(item.rate),
            amount: new Prisma.Decimal(itemAmount),
            unit: item.unit || 'KG',
            notes: item.notes,
          },
        });
        const lotNumber = item.lotNumber || generateReferenceNumber('LOT', businessId);
        await tx.lot.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            item_id: item.itemId,
            purchase_id: purchaseId,
            lot_number: lotNumber,
            initial_qty: new Prisma.Decimal(item.quantity),
            available_qty: new Prisma.Decimal(item.quantity),
            sold_qty: new Prisma.Decimal(0),
            purchase_rate: new Prisma.Decimal(item.rate),
            unit: item.unit || 'KG',
            status: 'AVAILABLE',
          },
        });
        const inv = await tx.inventoryItem.findUnique({ where: { id: item.itemId } });
        if (inv) {
          await tx.inventoryItem.update({
            where: { id: item.itemId },
            data: {
              quantity_in: new Prisma.Decimal(Number(inv.quantity_in) + item.quantity),
              current_stock: new Prisma.Decimal(Number(inv.current_stock) + item.quantity),
            },
          });
        }
      }
      for (const expense of expenses) {
        const isPaid = expense.isPaid !== false;
        await tx.purchaseExpense.create({
          data: {
            id: uuidv4(), purchase_id: purchaseId,
            expense_type_id: expense.expenseTypeId,
            expense_category: expense.expenseCategory,
            amount: new Prisma.Decimal(expense.amount),
            is_paid: isPaid,
            // Was dropped on edit, silently losing the attached receipt.
            receipt_url: expense.receiptUrl || null,
            notes: expense.notes,
          },
        });
        if (!isPaid) {
          // party_id deliberately null — the expense is owed to a
          // transporter/vendor, not the supplier (whose balance excludes
          // expenses); see the matching comment in createPurchase.
          await tx.ledgerEntry.create({
            data: {
              id: uuidv4(), business_id: businessId, party_id: null,
              purchase_id: purchaseId, entry_date: purchaseDate,
              account_type: 'PARTY_PAYABLE', entry_type: 'CREDIT',
              amount: new Prisma.Decimal(expense.amount),
              narration: `Unpaid expense (${expense.expenseCategory}) for purchase ${purchase.purchase_number}`,
              reference_type: 'expense', reference_id: purchaseId,
            },
          });
        }
      }
      for (const ct of cutterTransactions) {
        const isPaid = ct.isPaid !== false;
        await tx.cutterTransaction.create({
          data: {
            id: uuidv4(), purchase_id: purchaseId,
            cutter_id: ct.cutterId,
            quantity: new Prisma.Decimal(ct.quantity),
            rate: new Prisma.Decimal(ct.rate),
            amount: new Prisma.Decimal(ct.quantity * ct.rate),
            is_paid: isPaid,
            receipt_url: ct.receiptUrl || null,
            notes: ct.notes,
          },
        });
        if (!isPaid) {
          const cutter = await tx.cutter.findUnique({
            where: { id: ct.cutterId },
            select: { id: true, name: true, party_id: true },
          });
          await tx.ledgerEntry.create({
            data: {
              id: uuidv4(), business_id: businessId,
              party_id: cutter?.party_id || null,
              purchase_id: purchaseId, entry_date: purchaseDate,
              account_type: 'PARTY_PAYABLE', entry_type: 'CREDIT',
              amount: new Prisma.Decimal(ct.quantity * ct.rate),
              narration: `Unpaid cutter cost: ${cutter?.name || ct.cutterId} for purchase ${purchase.purchase_number}`,
              reference_type: 'cutter', reference_id: purchaseId,
            },
          });
          // Increment the cutter Party's payable balance
          if (cutter?.party_id) {
            await tx.party.update({
              where: { id: cutter.party_id },
              data: { balance: { increment: new Prisma.Decimal(ct.quantity * ct.rate) } },
            });
          }
        }
      }
      for (const payment of payments) {
        if (payment.paymentMode === 'CREDIT') continue;
        await tx.payment.create({
          data: {
            id: uuidv4(), business_id: businessId,
            reference_type: 'PURCHASE', reference_id: purchaseId,
            payer_party_id: null, payee_party_id: partyId,
            payment_mode: payment.paymentMode as any,
            amount: new Prisma.Decimal(payment.amount),
            payment_date: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            transaction_ref: payment.transactionRef,
            remaining_balance: new Prisma.Decimal(balanceAmount),
            status: paymentStatus,
            notes: payment.notes,
            receipt_url: payment.receiptUrl || null,
          },
        });
      }
      // Ledger
      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(), business_id: businessId, party_id: partyId,
          purchase_id: purchaseId, entry_date: purchaseDate,
          account_type: 'INVENTORY', entry_type: 'DEBIT',
          amount: new Prisma.Decimal(totalAmount),
          narration: `Purchase ${purchase.purchase_number} updated`,
          reference_type: 'purchase', reference_id: purchaseId,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(), business_id: businessId, party_id: partyId,
          purchase_id: purchaseId, entry_date: purchaseDate,
          account_type: 'PARTY_PAYABLE', entry_type: 'CREDIT',
          amount: new Prisma.Decimal(partyAmount),
          narration: `Payable for purchase ${purchase.purchase_number}`,
          reference_type: 'purchase', reference_id: purchaseId,
        },
      });
      if (paidAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(), business_id: businessId, party_id: partyId,
            purchase_id: purchaseId, entry_date: purchaseDate,
            account_type: 'PARTY_PAYABLE', entry_type: 'DEBIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Payment for purchase ${purchase.purchase_number}`,
            reference_type: 'payment', reference_id: purchaseId,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(), business_id: businessId, party_id: partyId,
            purchase_id: purchaseId, entry_date: purchaseDate,
            account_type: 'CASH', entry_type: 'CREDIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Cash/Bank paid for purchase ${purchase.purchase_number}`,
            reference_type: 'payment', reference_id: purchaseId,
          },
        });
      }
      // Update party balance with party-facing amount only
      await tx.party.update({
        where: { id: partyId },
        data: { balance: { increment: new Prisma.Decimal(partyBalanceAmount) } },
      });

      // Re-create reminders
      const updateReminders = data.reminders && data.reminders.length > 0
        ? data.reminders
        : data.reminderDate !== undefined
          ? (data.reminderDate ? [{ remindOn: data.reminderDate, amount: data.reminderAmount ?? undefined, note: undefined }] : [])
          : [];
      for (const r of updateReminders) {
        await tx.paymentReminder.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'purchase',
            reference_id: purchaseId,
            remind_on: new Date(r.remindOn),
            amount: r.amount != null && r.amount > 0 ? new Prisma.Decimal(r.amount) : null,
            note: r.note || null,
          },
        });
      }

      const result = await tx.purchase.findUnique({
        where: { id: purchaseId },
        include: {
          party: true, shop: true,
          items: { include: { item: true } },
          expenses: { include: { expense_type: true } },
          cutter_transactions: { include: { cutter: true } },
          lots: true, attachments: true,
        },
      });
      const fetchedPayments = await tx.payment.findMany({
        where: { reference_type: 'PURCHASE', reference_id: purchaseId },
      });
      const fetchedReminders = await tx.paymentReminder.findMany({
        where: { reference_type: 'purchase', reference_id: purchaseId },
        orderBy: { remind_on: 'asc' },
      });
      return { ...result, payments: fetchedPayments, reminders: fetchedReminders };
    }, { maxWait: 10000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Add an attachment to a purchase
   */
  async addAttachment(purchaseId: string, businessId: string, uploadedBy: string, file: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }) {
    // Ownership check — without it a file could be attached to another
    // tenant's purchase (and rendered on THEIR detail page).
    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, business_id: businessId },
      select: { id: true },
    });
    if (!purchase) throw new NotFoundError('Purchase');

    return prisma.attachment.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        reference_type: 'purchase',
        purchase_id: purchaseId,
        uploaded_by: uploadedBy,
        file_name: file.fileName,
        file_url: file.fileUrl,
        file_type: file.fileType,
        file_size: file.fileSize,
      },
    });
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(attachmentId: string, businessId: string) {
    const att = await prisma.attachment.findFirst({ where: { id: attachmentId, business_id: businessId } });
    if (!att) throw new Error('Attachment not found');
    return prisma.attachment.delete({ where: { id: attachmentId } });
  }
}

export const purchaseService = new PurchaseService();
