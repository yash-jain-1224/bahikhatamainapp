import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, generateReferenceNumber, InsufficientStockError, NotFoundError, getPrismaClient } from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('sales-service');

interface SaleLotInput {
  lotId: string;
  itemId: string;
  quantitySold: number;
  rate: number;
}

interface SaleExpenseInput {
  expenseTypeId: string;
  expenseCategory: 'DIRECT' | 'INDIRECT';
  amount: number;
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

export class SalesService {
  /**
   * Create a lot-based sale with overselling prevention
   * CRITICAL: Must check lot availability, reduce stock, create ledger entries
   */
  async createSale(businessId: string, _userId: string, data: {
    shopId?: string;
    partyId: string;
    saleDate?: string;
    saleLots: SaleLotInput[];
    expenses: SaleExpenseInput[];
    payments: PaymentInput[];
    discount?: number;
    roundOff?: number;
    notes?: string;
    gstMode?: string;
    gstValue?: number;
    gstAmount?: number;
    reminderDate?: string;
    reminderAmount?: number;
    reminders?: ReminderInput[];
  }) {
    return prisma.$transaction(async (tx: any) => {
      // The party balance write below is keyed by id only — assert the party
      // belongs to this business or a guessed UUID is a cross-tenant write.
      const party = await tx.party.findFirst({
        where: { id: data.partyId, business_id: businessId },
        select: { id: true },
      });
      if (!party) throw new NotFoundError('Party');

      const saleNumber = generateReferenceNumber('SAL', businessId);
      const saleDate = data.saleDate ? new Date(data.saleDate) : new Date();

      // 1. Validate lot availability (PREVENT OVERSELLING)
      for (const saleLot of data.saleLots) {
        const lot = await tx.lot.findFirst({
          where: {
            id: saleLot.lotId,
            business_id: businessId,
            status: { in: ['AVAILABLE', 'PARTIAL'] },
          },
        });

        if (!lot) {
          throw new Error(`Lot ${saleLot.lotId} not found or not available`);
        }

        if (Number(lot.available_qty) < saleLot.quantitySold) {
          throw new InsufficientStockError(
            lot.lot_number,
            Number(lot.available_qty),
            saleLot.quantitySold,
          );
        }
      }

      // 2. Calculate subtotal from lot sales
      let subtotal = 0;
      for (const sl of data.saleLots) {
        subtotal += sl.quantitySold * sl.rate;
      }

      // 3. Calculate expenses
      let directExpense = 0;
      let indirectExpense = 0;
      for (const exp of data.expenses) {
        if (exp.expenseCategory === 'DIRECT') directExpense += exp.amount;
        else indirectExpense += exp.amount;
      }

      const discount = data.discount || 0;
      const roundOff = data.roundOff || 0;

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

      const totalAmount = subtotal + directExpense + indirectExpense + gstAmount - discount + roundOff;

      // Party-facing amount: what the customer actually owes
      // Formula: Subtotal + GST - Discount + Round-Off
      // Excludes: expenses (transport/labor costs borne by business, not charged to party)
      const partyAmount = subtotal + gstAmount - discount + roundOff;

      // 4. Calculate payments. CREDIT rows are a promise, not money received —
      // counting them marked credit sales PAID, zeroed the receivable and
      // wrote a cash ledger entry for cash that never arrived.
      let paidAmount = 0;
      for (const p of data.payments) {
        if (p.paymentMode === 'CREDIT') continue;
        paidAmount += p.amount;
      }
      const balanceAmount = totalAmount - paidAmount;
      // Party balance = what the customer still owes (excludes expenses)
      const partyBalanceAmount = Math.max(0, partyAmount - paidAmount);

      // Determine payment status (based on party-facing amount)
      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CREDIT' = 'UNPAID';
      if (paidAmount >= partyAmount) paymentStatus = 'PAID';
      else if (paidAmount > 0) paymentStatus = 'PARTIAL';
      else if (data.payments.some(p => p.paymentMode === 'CREDIT')) paymentStatus = 'CREDIT';

      // 5. Create sale record
      const sale = await tx.sale.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          shop_id: data.shopId,
          party_id: data.partyId,
          sale_number: saleNumber,
          sale_date: saleDate,
          subtotal: new Prisma.Decimal(subtotal),
          direct_expense: new Prisma.Decimal(directExpense),
          indirect_expense: new Prisma.Decimal(indirectExpense),
          discount: new Prisma.Decimal(discount),
          round_off: new Prisma.Decimal(roundOff),
          gst_mode: data.gstMode || null,
          gst_value: data.gstValue ? new Prisma.Decimal(data.gstValue) : null,
          gst_amount: new Prisma.Decimal(gstAmount),
          total_amount: new Prisma.Decimal(totalAmount),
          paid_amount: new Prisma.Decimal(paidAmount),
          balance_amount: new Prisma.Decimal(balanceAmount),
          payment_status: paymentStatus,
          reminder_date: data.reminderDate ? new Date(data.reminderDate) : null,
          reminder_amount: data.reminderAmount != null ? new Prisma.Decimal(data.reminderAmount) : null,
          notes: data.notes,
        },
      });

      // 6. Process each lot sale
      for (const saleLot of data.saleLots) {
        const amount = saleLot.quantitySold * saleLot.rate;

        // Create sale lot record
        await tx.saleLot.create({
          data: {
            id: uuidv4(),
            sale_id: sale.id,
            lot_id: saleLot.lotId,
            quantity_sold: new Prisma.Decimal(saleLot.quantitySold),
            rate: new Prisma.Decimal(saleLot.rate),
            amount: new Prisma.Decimal(amount),
          },
        });

        // Create sale item
        await tx.saleItem.create({
          data: {
            id: uuidv4(),
            sale_id: sale.id,
            item_id: saleLot.itemId,
            quantity: new Prisma.Decimal(saleLot.quantitySold),
            rate: new Prisma.Decimal(saleLot.rate),
            amount: new Prisma.Decimal(amount),
          },
        });

        // Update lot: reduce available_qty, increase sold_qty
        const lot = await tx.lot.findUnique({ where: { id: saleLot.lotId } });
        const newAvailable = Number(lot.available_qty) - saleLot.quantitySold;
        const newSold = Number(lot.sold_qty) + saleLot.quantitySold;
        const lotStatus = newAvailable <= 0 ? 'SOLD_OUT' : 'PARTIAL';

        await tx.lot.update({
          where: { id: saleLot.lotId },
          data: {
            available_qty: new Prisma.Decimal(Math.max(0, newAvailable)),
            sold_qty: new Prisma.Decimal(newSold),
            status: lotStatus,
          },
        });

        // Create lot history
        await tx.lotHistory.create({
          data: {
            id: uuidv4(),
            lot_id: saleLot.lotId,
            reference_type: 'sale',
            reference_id: sale.id,
            quantity_change: new Prisma.Decimal(-saleLot.quantitySold),
            balance_after: new Prisma.Decimal(Math.max(0, newAvailable)),
            notes: `Sale ${saleNumber}`,
          },
        });

        // Update inventory: quantity_out++, current_stock--
        const invItem = await tx.inventoryItem.findUnique({ where: { id: saleLot.itemId } });
        if (invItem) {
          const newQtyOut = Number(invItem.quantity_out) + saleLot.quantitySold;
          const newStock = Number(invItem.current_stock) - saleLot.quantitySold;

          await tx.inventoryItem.update({
            where: { id: saleLot.itemId },
            data: {
              quantity_out: new Prisma.Decimal(newQtyOut),
              current_stock: new Prisma.Decimal(Math.max(0, newStock)),
            },
          });

          // Inventory transaction
          await tx.inventoryTransaction.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              item_id: saleLot.itemId,
              txn_type: 'OUT',
              reference_type: 'sale',
              reference_id: sale.id,
              quantity: new Prisma.Decimal(saleLot.quantitySold),
              balance_after: new Prisma.Decimal(Math.max(0, newStock)),
              notes: `Sale ${saleNumber}`,
            },
          });
        }
      }

      // 7. Create sale expenses
      for (const exp of data.expenses) {
        await tx.saleExpense.create({
          data: {
            id: uuidv4(),
            sale_id: sale.id,
            expense_type_id: exp.expenseTypeId,
            expense_category: exp.expenseCategory,
            amount: new Prisma.Decimal(exp.amount),
            notes: exp.notes,
          },
        });
      }

      // 8. Create payments
      for (const payment of data.payments) {
        if (payment.paymentMode === 'CREDIT') continue;

        await tx.payment.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'SALE',
            reference_id: sale.id,
            payer_party_id: data.partyId,
            payee_party_id: null,
            payment_mode: payment.paymentMode as any,
            amount: new Prisma.Decimal(payment.amount),
            payment_date: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            transaction_ref: payment.transactionRef,
            receipt_url: payment.receiptUrl || null,
            remaining_balance: new Prisma.Decimal(balanceAmount),
            status: paymentStatus,
            notes: payment.notes,
          },
        });
      }

      // 9. Ledger entries (double-entry)
      // Dr Party Receivable / Cr Sales — only the party-facing amount
      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId,
          sale_id: sale.id,
          entry_date: saleDate,
          account_type: 'PARTY_RECEIVABLE',
          entry_type: 'DEBIT',
          amount: new Prisma.Decimal(partyAmount),
          narration: `Sale ${saleNumber} to party`,
          reference_type: 'sale',
          reference_id: sale.id,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          party_id: data.partyId,
          sale_id: sale.id,
          entry_date: saleDate,
          account_type: 'SALES',
          entry_type: 'CREDIT',
          amount: new Prisma.Decimal(partyAmount),
          narration: `Revenue from sale ${saleNumber}`,
          reference_type: 'sale',
          reference_id: sale.id,
        },
      });

      // If payment received: Dr Cash / Cr Party Receivable
      if (paidAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            party_id: data.partyId,
            sale_id: sale.id,
            entry_date: saleDate,
            account_type: 'CASH',
            entry_type: 'DEBIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Payment received for sale ${saleNumber}`,
            reference_type: 'payment',
            reference_id: sale.id,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            party_id: data.partyId,
            sale_id: sale.id,
            entry_date: saleDate,
            account_type: 'PARTY_RECEIVABLE',
            entry_type: 'CREDIT',
            amount: new Prisma.Decimal(paidAmount),
            narration: `Payment received for sale ${saleNumber}`,
            reference_type: 'payment',
            reference_id: sale.id,
          },
        });
      }

      // Update party balance (only the party-facing amount, excluding expenses)
      // Negative = receivable (customer owes us)
      await tx.party.update({
        where: { id: data.partyId },
        data: {
          balance: { decrement: new Prisma.Decimal(partyBalanceAmount) },
        },
      });

      logger.info('Sale created', {
        saleId: sale.id,
        saleNumber,
        businessId,
        total: totalAmount,
        lots: data.saleLots.length,
      });

      // 10. Create payment reminders
      const saleReminders = data.reminders && data.reminders.length > 0
        ? data.reminders
        : data.reminderDate
          ? [{ remindOn: data.reminderDate, amount: data.reminderAmount, note: undefined }]
          : [];

      for (const r of saleReminders) {
        await tx.paymentReminder.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'sale',
            reference_id: sale.id,
            remind_on: new Date(r.remindOn),
            amount: r.amount != null && r.amount > 0 ? new Prisma.Decimal(r.amount) : null,
            note: r.note || null,
          },
        });
      }

      const result = await tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          party: true,
          shop: true,
          items: { include: { item: true } },
          sale_lots: { include: { lot: true } },
          expenses: { include: { expense_type: true } },
        },
      });
      const payments = await tx.payment.findMany({
        where: { reference_type: 'SALE', reference_id: sale.id },
      });
      const reminders = await tx.paymentReminder.findMany({
        where: { reference_type: 'sale', reference_id: sale.id },
        orderBy: { remind_on: 'asc' },
      });
      return { ...result, payments, reminders };
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  /**
   * Get sale by ID
   */
  async getSaleById(saleId: string, businessId: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, business_id: businessId },
      include: {
        party: true,
        shop: true,
        items: { include: { item: true } },
        sale_lots: { include: { lot: { include: { item: true, history: { orderBy: { created_at: 'desc' } } } } } },
        expenses: { include: { expense_type: true } },
        attachments: true,
        ledger_entries: true,
      },
    });
    if (!sale) return null;
    const [payments, reminders] = await Promise.all([
      prisma.payment.findMany({ where: { reference_type: 'SALE', reference_id: saleId } }),
      prisma.paymentReminder.findMany({ where: { reference_type: 'sale', reference_id: saleId }, orderBy: { remind_on: 'asc' } }),
    ]);
    return { ...sale, payments, reminders };
  }

  /**
   * List sales with pagination and filters
   */
  async listSales(businessId: string, filters: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    date_from?: string;
    date_to?: string;
    partyId?: string;
    party_id?: string;
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
    const paymentStatus = filters.paymentStatus || filters.payment_status;

    const where: any = {
      business_id: businessId,
      status: 'ACTIVE',
    };

    if (startDate || endDate) {
      where.sale_date = {};
      if (startDate) where.sale_date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.sale_date.lte = end;
      }
    }
    if (partyId) where.party_id = partyId;
    if (paymentStatus && paymentStatus !== '__all__') where.payment_status = paymentStatus;
    if (filters.search) {
      where.OR = [
        { sale_number: { contains: filters.search, mode: 'insensitive' } },
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

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, phone: true } },
          sale_lots: { include: { lot: { select: { id: true, lot_number: true } } } },
          _count: { select: { sale_lots: true } },
        },
        orderBy: { [filters.sortBy || 'created_at']: filters.sortOrder || 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return {
      data: sales,
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
   * Get lot details with transaction history
   */
  async getLotDetails(lotId: string, businessId: string) {
    const lot = await prisma.lot.findFirst({
      where: { id: lotId, business_id: businessId },
      include: {
        item: true,
        purchase: { select: { id: true, purchase_number: true, party: { select: { name: true } } } },
        sale_lots: {
          include: {
            sale: { select: { id: true, sale_number: true, party: { select: { name: true } }, sale_date: true } },
          },
        },
        history: { orderBy: { created_at: 'desc' } },
      },
    });

    if (!lot) return null;

    // Calculate profit per lot
    const totalSaleRevenue = lot.sale_lots.reduce((sum: number, sl: any) => sum + Number(sl.amount), 0);
    const purchaseCost = Number(lot.purchase_rate) * Number(lot.sold_qty);
    const profitPerLot = totalSaleRevenue - purchaseCost;

    return {
      ...lot,
      profitPerLot,
      purchaseCost,
      totalSaleRevenue,
    };
  }

  /**
   * List lots for a business with filters
   */
  async listLots(businessId: string, filters: {
    page?: number;
    limit?: number;
    itemId?: string;
    status?: string;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { business_id: businessId };
    if (filters.itemId) where.item_id = filters.itemId;
    if (filters.status) where.status = filters.status;

    const [lots, total] = await Promise.all([
      prisma.lot.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          purchase: { select: { id: true, purchase_number: true } },
          _count: { select: { sale_lots: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.lot.count({ where }),
    ]);

    return {
      data: lots,
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
   * Delete (cancel) a sale and reverse inventory + ledger entries
   */
  async deleteSale(saleId: string, businessId: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, business_id: businessId },
      include: {
        sale_lots: true,
        items: true,
      },
    });

    if (!sale) throw new Error('Sale not found');
    if ((sale as any).status === 'CANCELLED') throw new Error('Sale already cancelled');

    return prisma.$transaction(async (tx: any) => {
      // Reverse lot quantities
      for (const saleLot of sale.sale_lots) {
        const lot = await tx.lot.findUnique({ where: { id: saleLot.lot_id } });
        if (lot) {
          const newAvailable = Number(lot.available_qty) + Number(saleLot.quantity_sold);
          const newSold = Number(lot.sold_qty) - Number(saleLot.quantity_sold);
          await tx.lot.update({
            where: { id: lot.id },
            data: {
              available_qty: new Prisma.Decimal(newAvailable),
              sold_qty: new Prisma.Decimal(Math.max(0, newSold)),
              status: newAvailable > 0 ? 'AVAILABLE' : lot.status,
            },
          });

          // Create lot history entry for reversal
          await tx.lotHistory.create({
            data: {
              id: uuidv4(),
              lot_id: lot.id,
              reference_type: 'sale_delete',
              reference_id: saleId,
              quantity_change: saleLot.quantity_sold,
              balance_after: new Prisma.Decimal(newAvailable),
              notes: `Reversal: Sale ${sale.sale_number} deleted`,
            },
          });
        }
      }

      // Reverse inventory
      for (const item of sale.items) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: item.item_id } });
        if (invItem) {
          const newQtyOut = Number(invItem.quantity_out) - Number(item.quantity);
          const newStock = Number(invItem.current_stock) + Number(item.quantity);
          await tx.inventoryItem.update({
            where: { id: item.item_id },
            data: {
              quantity_out: new Prisma.Decimal(Math.max(0, newQtyOut)),
              current_stock: new Prisma.Decimal(newStock),
            },
          });

          await tx.inventoryTransaction.create({
            data: {
              id: uuidv4(),
              business_id: businessId,
              item_id: item.item_id,
              txn_type: 'IN',
              reference_type: 'sale_delete',
              reference_id: saleId,
              quantity: item.quantity,
              balance_after: new Prisma.Decimal(newStock),
              notes: `Reversal: Sale ${sale.sale_number} deleted`,
            },
          });
        }
      }

      // Reverse party balance (only reverse party-facing amount, not expenses)
      // Party-facing amount = subtotal + gst - discount + round-off
      const salePartyAmount = Number(sale.subtotal) + Number(sale.gst_amount) - Number(sale.discount) + Number(sale.round_off);
      const salePaidAmount = Number(sale.paid_amount);
      const salePartyBalance = Math.max(0, salePartyAmount - salePaidAmount);

      await tx.party.update({
        where: { id: sale.party_id },
        data: {
          balance: { increment: new Prisma.Decimal(salePartyBalance) },
        },
      });

      // Soft delete sale
      return tx.sale.update({
        where: { id: saleId },
        data: { status: 'CANCELLED' },
      });
    });
  }

  /**
   * Simple field-level update for notes, sale_date, party etc.
   * Does NOT re-process lots/payments (use delete + recreate for that).
   * When GST/discount/roundOff change, recalculates party balance automatically.
   */
  async updateSale(saleId: string, businessId: string, _userId: string | undefined, data: {
    partyId?: string;
    saleDate?: string;
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
    const existing = await prisma.sale.findFirst({ where: { id: saleId, business_id: businessId } });
    if (!existing) throw new Error('Sale not found');

    // A party change must stay inside the business.
    if (data.partyId && data.partyId !== existing.party_id) {
      const party = await prisma.party.findFirst({
        where: { id: data.partyId, business_id: businessId },
        select: { id: true },
      });
      if (!party) throw new NotFoundError('Party');
    }

    // Calculate old party-facing amount
    const oldPartyAmount = Number(existing.subtotal) + Number(existing.gst_amount) - Number(existing.discount) + Number(existing.round_off);
    const oldPaid = Number(existing.paid_amount);
    const oldPartyBalance = Math.max(0, oldPartyAmount - oldPaid);

    // Determine new values
    const newDiscount = data.discount !== undefined ? data.discount : Number(existing.discount);
    const newRoundOff = data.roundOff !== undefined ? data.roundOff : Number(existing.round_off);
    const newGstAmount = data.gstAmount != null ? data.gstAmount : Number(existing.gst_amount);

    // Recalculate totals
    const subtotal = Number(existing.subtotal);
    const directExpense = Number(existing.direct_expense);
    const indirectExpense = Number(existing.indirect_expense);
    const newTotalAmount = subtotal + directExpense + indirectExpense + newGstAmount - newDiscount + newRoundOff;
    const newPartyAmount = subtotal + newGstAmount - newDiscount + newRoundOff;
    const newBalanceAmount = newTotalAmount - oldPaid;
    const newPartyBalance = Math.max(0, newPartyAmount - oldPaid);

    // Determine payment status based on new party-facing amount
    let paymentStatus = existing.payment_status;
    if (oldPaid >= newPartyAmount) paymentStatus = 'PAID';
    else if (oldPaid > 0) paymentStatus = 'PARTIAL';
    else paymentStatus = 'UNPAID';

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        ...(data.partyId ? { party_id: data.partyId } : {}),
        ...(data.saleDate ? { sale_date: new Date(data.saleDate) } : {}),
        notes: data.notes ?? existing.notes,
        ...(data.discount !== undefined ? { discount: new Prisma.Decimal(data.discount) } : {}),
        ...(data.roundOff !== undefined ? { round_off: new Prisma.Decimal(data.roundOff) } : {}),
        ...(data.gstMode !== undefined ? {
          gst_mode: data.gstMode,
          gst_value: data.gstValue != null ? new Prisma.Decimal(data.gstValue) : null,
          gst_amount: data.gstAmount != null ? new Prisma.Decimal(data.gstAmount) : (existing as any).gst_amount,
        } : {}),
        ...(data.reminderDate !== undefined ? {
          reminder_date: data.reminderDate ? new Date(data.reminderDate) : null,
        } : {}),
        ...(data.reminderAmount !== undefined ? {
          reminder_amount: data.reminderAmount != null ? new Prisma.Decimal(data.reminderAmount) : null,
        } : {}),
        total_amount: new Prisma.Decimal(newTotalAmount),
        balance_amount: new Prisma.Decimal(newBalanceAmount),
        payment_status: paymentStatus as any,
      },
      include: {
        party: true,
        sale_lots: { include: { lot: { include: { item: true } } } },
        attachments: true,
      },
    });

    // Adjust party balance: reverse old party balance, apply new
    const balanceDiff = newPartyBalance - oldPartyBalance;
    if (balanceDiff !== 0) {
      await prisma.party.update({
        where: { id: existing.party_id },
        data: {
          balance: { decrement: new Prisma.Decimal(balanceDiff) },
        },
      });
    }

    // Replace reminders if provided
    if (data.reminders !== undefined) {
      await prisma.paymentReminder.deleteMany({ where: { reference_type: 'sale', reference_id: saleId } });
      for (const r of data.reminders) {
        await prisma.paymentReminder.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'sale',
            reference_id: saleId,
            remind_on: new Date(r.remindOn),
            amount: r.amount != null && r.amount > 0 ? new Prisma.Decimal(r.amount) : null,
            note: r.note || null,
          },
        });
      }
    } else if (data.reminderDate !== undefined) {
      await prisma.paymentReminder.deleteMany({ where: { reference_type: 'sale', reference_id: saleId } });
      if (data.reminderDate) {
        await prisma.paymentReminder.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: 'sale',
            reference_id: saleId,
            remind_on: new Date(data.reminderDate),
            amount: data.reminderAmount != null && data.reminderAmount > 0 ? new Prisma.Decimal(data.reminderAmount) : null,
          },
        });
      }
    }

    const reminders = await prisma.paymentReminder.findMany({
      where: { reference_type: 'sale', reference_id: saleId },
      orderBy: { remind_on: 'asc' },
    });
    return { ...updated, reminders };
  }

  /**
   * Add an attachment (bill / PDF) to a sale
   */
  async addAttachment(saleId: string, businessId: string, uploadedBy: string, file: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }) {
    // Ownership check — without it a file could be attached to another
    // tenant's sale and rendered on THEIR detail page (which the victim could
    // not even delete, since deleteAttachment filters by business_id).
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, business_id: businessId },
      select: { id: true },
    });
    if (!sale) throw new NotFoundError('Sale');

    return prisma.attachment.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        reference_type: 'sale',
        sale_id: saleId,
        uploaded_by: uploadedBy,
        file_name: file.fileName,
        file_url: file.fileUrl,
        file_type: file.fileType,
        file_size: file.fileSize,
      },
    });
  }

  /**
   * Delete a sale attachment
   */
  async deleteAttachment(attachmentId: string, businessId: string) {
    const att = await prisma.attachment.findFirst({ where: { id: attachmentId, business_id: businessId } });
    if (!att) throw new Error('Attachment not found');
    return prisma.attachment.delete({ where: { id: attachmentId } });
  }

  /**
   * Get sales dashboard stats
   */
  async getSalesDashboard(businessId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayStats, monthStats, totalStats, recentSales] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          business_id: businessId,
          sale_date: { gte: today, lt: tomorrow },
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          business_id: businessId,
          sale_date: { gte: thisMonthStart },
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          business_id: businessId,
          status: { not: 'CANCELLED' },
        },
        _sum: { total_amount: true, paid_amount: true, balance_amount: true },
        _count: true,
      }),
      prisma.sale.findMany({
        where: { business_id: businessId, status: { not: 'CANCELLED' } },
        orderBy: { sale_date: 'desc' },
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
      recentSales: recentSales.map((s: any) => ({
        id: s.id,
        saleNumber: s.sale_number,
        date: s.sale_date,
        partyName: s.party?.name,
        totalAmount: Number(s.total_amount),
        paymentStatus: s.payment_status,
      })),
    };
  }
}

export const salesService = new SalesService();
