import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger, generateReferenceNumber,
  parsePagination, getPaginationOffset, buildPaginationMeta,
  NotFoundError, BadRequestError,
  getPrismaClient,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('billing-service');

export class BillingService {
  // ─── INVOICES ───────────────────────────────────────────
  async generateInvoice(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, business: true },
    });
    if (!subscription) throw new NotFoundError('Subscription');

    const plan = subscription.plan;
    let amount = 0;
    switch (subscription.billing_cycle) {
      case 'MONTHLY': amount = Number(plan.price_monthly); break;
      case 'QUARTERLY': amount = Number(plan.price_quarterly); break;
      case 'HALF_YEARLY': amount = Number(plan.price_half_yearly); break;
      case 'YEARLY': amount = Number(plan.price_yearly); break;
    }

    const taxRate = 0.18; // 18% GST
    const taxAmount = amount * taxRate;
    const totalAmount = amount + taxAmount;

    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        business_id: subscription.business_id,
        subscription_id: subscriptionId,
        invoice_number: generateReferenceNumber('INV', subscription.business_id),
        amount: new Prisma.Decimal(amount),
        tax_amount: new Prisma.Decimal(taxAmount),
        total_amount: new Prisma.Decimal(totalAmount),
        status: 'PENDING',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    logger.info('Invoice generated', { invoiceId: invoice.id, subscriptionId });
    return invoice;
  }

  async getInvoice(invoiceId: string, businessId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, business_id: businessId },
      include: {
        subscription: { include: { plan: true } },
        business: { select: { id: true, name: true, gst_number: true, address: true } },
      },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    return invoice;
  }

  async listInvoices(businessId: string, query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId };
    if (query.status) where.status = query.status;
    const iStart = query.startDate || query.date_from;
    const iEnd = query.endDate || query.date_to;
    if (iStart || iEnd) {
      where.created_at = {};
      if (iStart) where.created_at.gte = new Date(iStart);
      if (iEnd) {
        const e = new Date(iEnd);
        e.setHours(23, 59, 59, 999);
        where.created_at.lte = e;
      }
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { subscription: { include: { plan: true } } },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data: invoices, meta: buildPaginationMeta(total, page, limit) };
  }

  async markInvoicePaid(invoiceId: string, paymentData: {
    razorpayPaymentId?: string; razorpayOrderId?: string;
  }) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === 'PAID') throw new BadRequestError('Invoice already paid');

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        razorpay_payment_id: paymentData.razorpayPaymentId,
        razorpay_order_id: paymentData.razorpayOrderId,
        paid_at: new Date(),
      },
    });

    // Activate subscription if needed
    await prisma.subscription.updateMany({
      where: { id: invoice.subscription_id, status: { in: ['PAST_DUE', 'TRIAL'] } },
      data: { status: 'ACTIVE' },
    });

    logger.info('Invoice marked paid', { invoiceId });
    return updated;
  }

  // ─── PAYMENTS ───────────────────────────────────────────
  async createPayment(businessId: string, _userId: string, data: {
    referenceType: string; referenceId: string;
    payerPartyId?: string; payeePartyId?: string;
    paymentMode: string; amount: number;
    paymentDate?: string; transactionRef?: string; notes?: string;
  }) {
    return prisma.$transaction(async (tx: any) => {
      // Every id in this payload arrives from the client, and nothing below
      // used to scope it to the caller's business: the purchase/sale lookups
      // were findUnique({ where: { id } }) and both party balance updates were
      // update({ where: { id } }). A user of business A could therefore post a
      // payment referencing business B's purchase and mutate B's paid_amount,
      // balance_amount and payment_status — or move any party's balance in any
      // tenant. Resolve every reference against businessId first and refuse
      // anything that does not belong here.
      if (data.referenceType === 'PURCHASE') {
        const owned = await tx.purchase.findFirst({
          where: { id: data.referenceId, business_id: businessId },
          select: { id: true },
        });
        if (!owned) throw new NotFoundError('Purchase');
      } else if (data.referenceType === 'SALE') {
        const owned = await tx.sale.findFirst({
          where: { id: data.referenceId, business_id: businessId },
          select: { id: true },
        });
        if (!owned) throw new NotFoundError('Sale');
      }

      for (const partyId of [data.payerPartyId, data.payeePartyId]) {
        if (!partyId) continue;
        const party = await tx.party.findFirst({
          where: { id: partyId, business_id: businessId },
          select: { id: true },
        });
        if (!party) throw new NotFoundError('Party');
      }

      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          reference_type: data.referenceType,
          reference_id: data.referenceId,
          payer_party_id: data.payerPartyId,
          payee_party_id: data.payeePartyId,
          payment_mode: data.paymentMode,
          amount: new Prisma.Decimal(data.amount),
          payment_date: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          transaction_ref: data.transactionRef,
          notes: data.notes,
          status: 'PAID',
        },
      });

      // Update purchase/sale paid_amount and payment_status
      if (data.referenceType === 'PURCHASE') {
        const purchase = await tx.purchase.findFirst({ where: { id: data.referenceId, business_id: businessId } });
        if (purchase) {
          const newPaid = Number(purchase.paid_amount) + data.amount;
          // Party-facing basis (subtotal+gst-discount+roundoff): the doc services
          // compute payment_status against this, and recomputing here against
          // total_amount flipped fully-paid docs back to PARTIAL.
          const partyAmount = Number(purchase.subtotal) + Number(purchase.gst_amount) - Number(purchase.discount) + Number(purchase.round_off);
          const newBalance = partyAmount - newPaid;
          let paymentStatus = 'PARTIAL';
          if (newPaid >= partyAmount) paymentStatus = 'PAID';
          else if (newPaid === 0) paymentStatus = 'UNPAID';

          await tx.purchase.update({
            where: { id: data.referenceId },
            data: {
              paid_amount: new Prisma.Decimal(newPaid),
              balance_amount: new Prisma.Decimal(Math.max(0, newBalance)),
              payment_status: paymentStatus,
            },
          });

          // Create ledger entries
          await tx.ledgerEntry.createMany({
            data: [
              {
                id: uuidv4(),
                business_id: businessId,
                party_id: data.payeePartyId,
                purchase_id: data.referenceId,
                payment_id: payment.id,
                account_type: 'PARTY_PAYABLE',
                entry_type: 'DEBIT',
                amount: new Prisma.Decimal(data.amount),
                narration: `Payment for purchase ${purchase.purchase_number}`,
                reference_type: 'payment',
                reference_id: payment.id,
              },
              {
                id: uuidv4(),
                business_id: businessId,
                payment_id: payment.id,
                account_type: data.paymentMode === 'CASH' ? 'CASH' : 'BANK',
                entry_type: 'CREDIT',
                amount: new Prisma.Decimal(data.amount),
                narration: `Payment for purchase ${purchase.purchase_number}`,
                reference_type: 'payment',
                reference_id: payment.id,
              },
            ],
          });
        } else {
          // The bill vanished between the ownership pre-check and here (or the
          // pre-check was bypassed). Silently falling through used to leave a
          // Payment row and a moved party balance against a non-existent
          // purchase, returning 201 for a no-op. Throw so the transaction
          // rolls back everything.
          throw new NotFoundError('Purchase');
        }
      } else if (data.referenceType === 'SALE') {
        const sale = await tx.sale.findFirst({ where: { id: data.referenceId, business_id: businessId } });
        if (sale) {
          const newPaid = Number(sale.paid_amount) + data.amount;
          // Party-facing basis (subtotal+gst-discount+roundoff): the doc services
          // compute payment_status against this, and recomputing here against
          // total_amount flipped fully-paid docs back to PARTIAL.
          const partyAmount = Number(sale.subtotal) + Number(sale.gst_amount) - Number(sale.discount) + Number(sale.round_off);
          const newBalance = partyAmount - newPaid;
          let paymentStatus = 'PARTIAL';
          if (newPaid >= partyAmount) paymentStatus = 'PAID';
          else if (newPaid === 0) paymentStatus = 'UNPAID';

          await tx.sale.update({
            where: { id: data.referenceId },
            data: {
              paid_amount: new Prisma.Decimal(newPaid),
              balance_amount: new Prisma.Decimal(Math.max(0, newBalance)),
              payment_status: paymentStatus,
            },
          });

          // Create ledger entries
          await tx.ledgerEntry.createMany({
            data: [
              {
                id: uuidv4(),
                business_id: businessId,
                payment_id: payment.id,
                account_type: data.paymentMode === 'CASH' ? 'CASH' : 'BANK',
                entry_type: 'DEBIT',
                amount: new Prisma.Decimal(data.amount),
                narration: `Received payment for sale ${sale.sale_number}`,
                reference_type: 'payment',
                reference_id: payment.id,
              },
              {
                id: uuidv4(),
                business_id: businessId,
                party_id: data.payerPartyId,
                sale_id: data.referenceId,
                payment_id: payment.id,
                account_type: 'PARTY_RECEIVABLE',
                entry_type: 'CREDIT',
                amount: new Prisma.Decimal(data.amount),
                narration: `Received payment for sale ${sale.sale_number}`,
                reference_type: 'payment',
                reference_id: payment.id,
              },
            ],
          });
        } else {
          // Same as the purchase branch: never record a payment against a
          // sale that cannot be found for this business.
          throw new NotFoundError('Sale');
        }
      }

      // Update party balance. Convention: negative = receivable, positive =
      // payable, so money IN from the payer settles a receivable (increment
      // toward zero) and money OUT to the payee settles a payable (decrement).
      // Both directions were inverted — see createQuickPayment.
      if (data.payerPartyId) {
        await tx.party.update({
          where: { id: data.payerPartyId },
          data: { balance: { increment: new Prisma.Decimal(data.amount) } },
        });
      }
      if (data.payeePartyId) {
        await tx.party.update({
          where: { id: data.payeePartyId },
          data: { balance: { decrement: new Prisma.Decimal(data.amount) } },
        });
      }

      logger.info('Payment created', { paymentId: payment.id, businessId, amount: data.amount });
      return payment;
    });
  }

  async listPayments(businessId: string, query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { business_id: businessId };
    if (query.referenceType) where.reference_type = query.referenceType;
    if (query.referenceId) where.reference_id = query.referenceId;
    if (query.paymentMode) where.payment_mode = query.paymentMode;
    if (query.mode) where.payment_mode = query.mode;
    if (query.status) where.status = query.status;
    // Date filters (accept both legacy and frontend keys)
    const pStart = query.startDate || query.date_from;
    const pEnd = query.endDate || query.date_to;
    if (pStart || pEnd) {
      where.payment_date = {};
      if (pStart) where.payment_date.gte = new Date(pStart);
      if (pEnd) {
        const e = new Date(pEnd);
        e.setHours(23, 59, 59, 999);
        where.payment_date.lte = e;
      }
    }
    // Amount range
    const amtMin = query.amount_min !== undefined ? Number(query.amount_min) : undefined;
    const amtMax = query.amount_max !== undefined ? Number(query.amount_max) : undefined;
    if (amtMin !== undefined || amtMax !== undefined) {
      where.amount = {};
      if (amtMin !== undefined && !Number.isNaN(amtMin)) where.amount.gte = amtMin;
      if (amtMax !== undefined && !Number.isNaN(amtMax)) where.amount.lte = amtMax;
    }
    if (query.search) {
      where.OR = [
        { payer: { name: { contains: query.search, mode: 'insensitive' } } },
        { payee: { name: { contains: query.search, mode: 'insensitive' } } },
        { transaction_ref: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          payer: { select: { id: true, name: true } },
          payee: { select: { id: true, name: true } },
        },
        orderBy: { payment_date: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    // Transform to frontend-friendly format
    const data = payments.map((p: any) => ({
      id: p.id,
      type: p.payer_party_id ? 'IN' : 'OUT',
      party_name: p.payer?.name || p.payee?.name || 'Unknown',
      party_id: p.payer_party_id || p.payee_party_id,
      amount: Number(p.amount),
      date: p.payment_date?.toISOString?.() || p.payment_date,
      mode: p.payment_mode,
      status: p.status,
      reference: p.transaction_ref,
      notes: p.notes,
    }));

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * Quick payment - simplified format from the frontend RecordPaymentDialog
   * Accepts: { type: IN|OUT, party_id, amount, date, mode, reference, notes }
   */
  async createQuickPayment(businessId: string, _userId: string, data: {
    type: 'IN' | 'OUT';
    party_id: string;
    amount: number;
    date?: string;
    mode: string;
    reference?: string;
    notes?: string;
  }) {
    return prisma.$transaction(async (tx: any) => {
      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          reference_type: data.type === 'IN' ? 'SALE' : 'PURCHASE',
          reference_id: businessId, // generic reference
          payer_party_id: data.type === 'IN' ? data.party_id : undefined,
          payee_party_id: data.type === 'OUT' ? data.party_id : undefined,
          payment_mode: data.mode,
          amount: new Prisma.Decimal(data.amount),
          payment_date: data.date ? new Date(data.date) : new Date(),
          transaction_ref: data.reference,
          notes: data.notes,
          status: 'PAID',
        },
      });

      // Create ledger entries
      if (data.type === 'IN') {
        await tx.ledgerEntry.createMany({
          data: [
            {
              id: uuidv4(),
              business_id: businessId,
              payment_id: payment.id,
              account_type: data.mode === 'CASH' ? 'CASH' : 'BANK',
              entry_type: 'DEBIT',
              amount: new Prisma.Decimal(data.amount),
              narration: `Payment received from party${data.notes ? ': ' + data.notes : ''}`,
              reference_type: 'payment',
              reference_id: payment.id,
              entry_date: data.date ? new Date(data.date) : new Date(),
            },
            {
              id: uuidv4(),
              business_id: businessId,
              party_id: data.party_id,
              payment_id: payment.id,
              account_type: 'PARTY_RECEIVABLE',
              entry_type: 'CREDIT',
              amount: new Prisma.Decimal(data.amount),
              narration: `Payment received from party${data.notes ? ': ' + data.notes : ''}`,
              reference_type: 'payment',
              reference_id: payment.id,
              entry_date: data.date ? new Date(data.date) : new Date(),
            },
          ],
        });

        // Settle the receivable. Convention: negative = receivable, so a
        // payment IN must move the balance TOWARD zero (increment). This was
        // a decrement — verified live: a ₹400 payment against a −₹1,000
        // receivable produced −₹1,400, growing what the customer owed.
        await tx.party.update({
          where: { id: data.party_id },
          data: { balance: { increment: new Prisma.Decimal(data.amount) } },
        });
      } else {
        await tx.ledgerEntry.createMany({
          data: [
            {
              id: uuidv4(),
              business_id: businessId,
              party_id: data.party_id,
              payment_id: payment.id,
              account_type: 'PARTY_PAYABLE',
              entry_type: 'DEBIT',
              amount: new Prisma.Decimal(data.amount),
              narration: `Payment made to party${data.notes ? ': ' + data.notes : ''}`,
              reference_type: 'payment',
              reference_id: payment.id,
              entry_date: data.date ? new Date(data.date) : new Date(),
            },
            {
              id: uuidv4(),
              business_id: businessId,
              payment_id: payment.id,
              account_type: data.mode === 'CASH' ? 'CASH' : 'BANK',
              entry_type: 'CREDIT',
              amount: new Prisma.Decimal(data.amount),
              narration: `Payment made to party${data.notes ? ': ' + data.notes : ''}`,
              reference_type: 'payment',
              reference_id: payment.id,
              entry_date: data.date ? new Date(data.date) : new Date(),
            },
          ],
        });

        // Settle the payable (positive = payable): a payment OUT must
        // decrement toward zero. The comment said "decrease" while the code
        // incremented — same inversion as the IN branch.
        await tx.party.update({
          where: { id: data.party_id },
          data: { balance: { decrement: new Prisma.Decimal(data.amount) } },
        });
      }

      logger.info('Quick payment created', { paymentId: payment.id, type: data.type, amount: data.amount });
      return payment;
    });
  }

  async attachReceipt(paymentId: string, businessId: string, receiptUrl: string) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, business_id: businessId } });
    if (!payment) throw new Error('Payment not found');
    return prisma.payment.update({
      where: { id: paymentId },
      data: { receipt_url: receiptUrl } as any,
    });
  }

  // ─── OUTSTANDING BILLS FOR A PARTY ────────────────────────────────────────
  async getPartyOutstandingBills(businessId: string, partyId: string, type: 'IN' | 'OUT') {
    if (type === 'IN') {
      // Money IN → sales with outstanding balance
      const sales = await prisma.sale.findMany({
        where: {
          business_id: businessId,
          party_id: partyId,
          payment_status: { in: ['UNPAID', 'PARTIAL'] },
          balance_amount: { gt: 0 },
        },
        select: {
          id: true,
          sale_number: true,
          sale_date: true,
          subtotal: true,
          gst_amount: true,
          discount: true,
          round_off: true,
          total_amount: true,
          paid_amount: true,
          balance_amount: true,
          payment_status: true,
        },
        orderBy: { sale_date: 'asc' },
      });
      // The PARTY-FACING amount (subtotal + gst - discount + round_off)
      // excludes internal expenses baked into total_amount. The party detail
      // page shows the party-facing figure; allocating payments against the
      // larger total made the two screens disagree about the same bill and
      // "pay full balance" pay more than the page said was owed.
      return sales.map((s: any) => {
        const partyAmount = Number(s.subtotal) + Number(s.gst_amount) - Number(s.discount) + Number(s.round_off);
        const partyBalance = Math.max(0, partyAmount - Number(s.paid_amount));
        return {
          id: s.id,
          ref: s.sale_number,
          date: s.sale_date,
          total: partyAmount,
          paid: Number(s.paid_amount),
          balance: partyBalance,
          status: s.payment_status,
          type: 'SALE' as const,
        };
      });
    } else {
      // Money OUT → purchases with outstanding balance
      const purchases = await prisma.purchase.findMany({
        where: {
          business_id: businessId,
          party_id: partyId,
          payment_status: { in: ['UNPAID', 'PARTIAL'] },
          balance_amount: { gt: 0 },
        },
        select: {
          id: true,
          purchase_number: true,
          purchase_date: true,
          subtotal: true,
          gst_amount: true,
          discount: true,
          round_off: true,
          total_amount: true,
          paid_amount: true,
          balance_amount: true,
          payment_status: true,
        },
        orderBy: { purchase_date: 'asc' },
      });
      // Party-facing amounts — see the sales branch above.
      return purchases.map((p: any) => {
        const partyAmount = Number(p.subtotal) + Number(p.gst_amount) - Number(p.discount) + Number(p.round_off);
        const partyBalance = Math.max(0, partyAmount - Number(p.paid_amount));
        return {
          id: p.id,
          ref: p.purchase_number,
          date: p.purchase_date,
          total: partyAmount,
          paid: Number(p.paid_amount),
          balance: partyBalance,
          status: p.payment_status,
          type: 'PURCHASE' as const,
        };
      });
    }
  }

  // ─── BULK / SPLIT PAYMENT ACROSS MULTIPLE BILLS ───────────────────────────
  async createBulkPayment(businessId: string, _userId: string, data: {
    type: 'IN' | 'OUT';
    party_id: string;
    mode: string;
    date?: string;
    reference?: string;
    notes?: string;
    allocations: { referenceId: string; referenceType: 'SALE' | 'PURCHASE'; amount: number }[];
  }) {
    return prisma.$transaction(async (tx: any) => {
      // The party and every allocation target must belong to this business —
      // the single-payment path was scoped in an earlier fix but this bulk
      // path still looked rows up by bare id (cross-tenant write).
      const bulkParty = await tx.party.findFirst({
        where: { id: data.party_id, business_id: businessId },
        select: { id: true },
      });
      if (!bulkParty) throw new NotFoundError('Party');

      const paymentDate = data.date ? new Date(data.date) : new Date();
      const createdPayments: any[] = [];

      for (const alloc of data.allocations) {
        if (alloc.amount <= 0) continue;

        const payment = await tx.payment.create({
          data: {
            id: uuidv4(),
            business_id: businessId,
            reference_type: alloc.referenceType,
            reference_id: alloc.referenceId,
            payer_party_id: data.type === 'IN' ? data.party_id : undefined,
            payee_party_id: data.type === 'OUT' ? data.party_id : undefined,
            payment_mode: data.mode,
            amount: new Prisma.Decimal(alloc.amount),
            payment_date: paymentDate,
            transaction_ref: data.reference,
            notes: data.notes,
            status: 'PAID',
          },
        });

        if (alloc.referenceType === 'PURCHASE') {
          const purchase = await tx.purchase.findFirst({ where: { id: alloc.referenceId, business_id: businessId } });
          if (purchase) {
            const newPaid = Number(purchase.paid_amount) + alloc.amount;
            const partyAmount = Number(purchase.subtotal) + Number(purchase.gst_amount) - Number(purchase.discount) + Number(purchase.round_off);
            const newBalance = Math.max(0, partyAmount - newPaid);
            const paymentStatus = newBalance === 0 ? 'PAID' : newPaid === 0 ? 'UNPAID' : 'PARTIAL';
            await tx.purchase.update({
              where: { id: alloc.referenceId },
              data: {
                paid_amount: new Prisma.Decimal(newPaid),
                balance_amount: new Prisma.Decimal(newBalance),
                payment_status: paymentStatus,
              },
            });
            await tx.ledgerEntry.createMany({
              data: [
                {
                  id: uuidv4(), business_id: businessId,
                  party_id: data.party_id, purchase_id: alloc.referenceId, payment_id: payment.id,
                  account_type: 'PARTY_PAYABLE', entry_type: 'DEBIT',
                  amount: new Prisma.Decimal(alloc.amount),
                  narration: `Payment for purchase ${purchase.purchase_number}`,
                  reference_type: 'payment', reference_id: payment.id,
                },
                {
                  id: uuidv4(), business_id: businessId, payment_id: payment.id,
                  account_type: data.mode === 'CASH' ? 'CASH' : 'BANK', entry_type: 'CREDIT',
                  amount: new Prisma.Decimal(alloc.amount),
                  narration: `Payment for purchase ${purchase.purchase_number}`,
                  reference_type: 'payment', reference_id: payment.id,
                },
              ],
            });
          }
        } else if (alloc.referenceType === 'SALE') {
          const sale = await tx.sale.findFirst({ where: { id: alloc.referenceId, business_id: businessId } });
          if (sale) {
            const newPaid = Number(sale.paid_amount) + alloc.amount;
            const partyAmount = Number(sale.subtotal) + Number(sale.gst_amount) - Number(sale.discount) + Number(sale.round_off);
            const newBalance = Math.max(0, partyAmount - newPaid);
            const paymentStatus = newBalance === 0 ? 'PAID' : newPaid === 0 ? 'UNPAID' : 'PARTIAL';
            await tx.sale.update({
              where: { id: alloc.referenceId },
              data: {
                paid_amount: new Prisma.Decimal(newPaid),
                balance_amount: new Prisma.Decimal(newBalance),
                payment_status: paymentStatus,
              },
            });
            await tx.ledgerEntry.createMany({
              data: [
                {
                  id: uuidv4(), business_id: businessId, payment_id: payment.id,
                  account_type: data.mode === 'CASH' ? 'CASH' : 'BANK', entry_type: 'DEBIT',
                  amount: new Prisma.Decimal(alloc.amount),
                  narration: `Received payment for sale ${sale.sale_number}`,
                  reference_type: 'payment', reference_id: payment.id,
                },
                {
                  id: uuidv4(), business_id: businessId,
                  party_id: data.party_id, sale_id: alloc.referenceId, payment_id: payment.id,
                  account_type: 'PARTY_RECEIVABLE', entry_type: 'CREDIT',
                  amount: new Prisma.Decimal(alloc.amount),
                  narration: `Received payment for sale ${sale.sale_number}`,
                  reference_type: 'payment', reference_id: payment.id,
                },
              ],
            });
          }
        }

        createdPayments.push(payment);
      }

      // Update party balance once for total amount. IN settles a receivable
      // (negative balance → increment toward zero); OUT settles a payable
      // (positive → decrement). Directions were inverted — see createQuickPayment.
      const totalAmount = data.allocations.reduce((s, a) => s + a.amount, 0);
      if (data.type === 'IN') {
        await tx.party.update({
          where: { id: data.party_id },
          data: { balance: { increment: new Prisma.Decimal(totalAmount) } },
        });
      } else {
        await tx.party.update({
          where: { id: data.party_id },
          data: { balance: { decrement: new Prisma.Decimal(totalAmount) } },
        });
      }

      logger.info('Bulk payment created', { businessId, count: createdPayments.length, totalAmount });
      return { payments: createdPayments, totalAmount };
    });
  }
}

export const billingService = new BillingService();
