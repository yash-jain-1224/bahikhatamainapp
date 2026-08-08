import { createLogger, NotFoundError, BadRequestError, ConflictError, getPrismaClient } from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('profile-service');

export class ProfileService {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        bank_accounts: true,
        business_users: {
          include: {
            business: { select: { id: true, name: true, type: true, logo_url: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundError('User');

    // `include` returns every scalar on the user row, so this was shipping
    // password_hash to the browser on both GET and PATCH /profile/me. It is the
    // caller's own hash rather than someone else's, but a bcrypt hash should
    // never leave the server — anywhere the response is logged, cached or read
    // via XSS it becomes an offline cracking target. Strip it explicitly rather
    // than switching to `select`, so a newly added sensitive column cannot be
    // exposed by omission later.
    const { password_hash: _passwordHash, ...safeUser } = user as typeof user & { password_hash?: string };
    return safeUser;
  }

  async updateProfile(userId: string, data: {
    name?: string; email?: string; avatarUrl?: string;
    address?: string; city?: string; state?: string;
    pincode?: string; panNumber?: string; aadharNumber?: string;
  }) {
    // A duplicate email used to surface as a raw Prisma P2002 → opaque 500.
    // Pre-check so the user gets an actionable conflict message instead.
    if (data.email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } },
        select: { id: true },
      });
      if (emailTaken) throw new ConflictError('This email is already in use');
    }

    // Update User
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.avatarUrl !== undefined && { avatar_url: data.avatarUrl }),
      },
    });

    // Upsert Profile
    await prisma.userProfile.upsert({
      where: { user_id: userId },
      update: {
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.pincode !== undefined && { pincode: data.pincode }),
        ...(data.panNumber !== undefined && { pan_number: data.panNumber }),
        ...(data.aadharNumber !== undefined && { aadhar_number: data.aadharNumber }),
      },
      create: {
        user_id: userId,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        pan_number: data.panNumber,
        aadhar_number: data.aadharNumber,
      },
    });

    logger.info('Profile updated', { userId });
    return this.getProfile(userId);
  }

  // ─── BANK ACCOUNTS ─────────────────────────────────────
  async addBankAccount(userId: string, data: {
    accountName: string; accountNumber: string; ifscCode: string;
    bankName: string; upiId?: string; isDefault?: boolean;
  }) {
    // The route has no zod validator (the vendored validators file is shared
    // across services and off limits), so required fields are enforced here —
    // otherwise a missing field died in Prisma as an opaque 500.
    const missing = (['accountName', 'accountNumber', 'ifscCode', 'bankName'] as const)
      .filter((f) => !data[f] || typeof data[f] !== 'string' || !data[f].trim());
    if (missing.length > 0) {
      throw new BadRequestError(`Missing required field(s): ${missing.join(', ')}`);
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
      throw new BadRequestError('Invalid IFSC code. Expected format: 4 letters, then 0, then 6 characters (e.g. HDFC0001234)');
    }

    if (data.isDefault) {
      await prisma.userBankAccount.updateMany({
        where: { user_id: userId },
        data: { is_default: false },
      });
    }

    return prisma.userBankAccount.create({
      data: {
        user_id: userId,
        account_name: data.accountName,
        account_number: data.accountNumber,
        ifsc_code: data.ifscCode,
        bank_name: data.bankName,
        upi_id: data.upiId,
        is_default: data.isDefault || false,
      },
    });
  }

  async listBankAccounts(userId: string) {
    return prisma.userBankAccount.findMany({
      where: { user_id: userId },
      orderBy: { is_default: 'desc' },
    });
  }

  async deleteBankAccount(accountId: string, userId: string) {
    const account = await prisma.userBankAccount.findFirst({
      where: { id: accountId, user_id: userId },
    });
    if (!account) throw new NotFoundError('Bank Account');

    return prisma.userBankAccount.delete({ where: { id: accountId } });
  }

  // ─── PARTY MANAGEMENT ──────────────────────────────────
  async createParty(businessId: string, data: {
    name: string;
    phone: string;
    whatsapp?: string;
    email?: string;
    type?: string;
    isMine?: boolean;
    openingBalance?: number;
    // GST
    gstRegistrationType?: string;
    gstNumber?: string;
    gstState?: string;
    panNumber?: string;
    // Address
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    // Credit
    creditPeriodDays?: number;
    creditLimit?: number;
    // Relations
    contacts?: { name: string; phone?: string; email?: string; tags?: string[]; notes?: string }[];
    bankAccounts?: { bankName: string; accountNumber: string; ifscCode: string; branch?: string; isPrimary?: boolean }[];
  }) {
    return prisma.party.create({
      data: {
        business_id: businessId,
        name: data.name,
        phone: data.phone,
        whatsapp: data.whatsapp,
        email: data.email,
        type: (data.type as any) || 'BOTH',
        is_mine: data.isMine ?? false,
        opening_balance: data.openingBalance ?? 0,
        balance: data.openingBalance ?? 0, // Initialize balance = opening_balance
        gst_registration_type: (data.gstRegistrationType as any) || 'UNREGISTERED',
        gst_number: data.gstNumber,
        gst_state: data.gstState,
        pan_number: data.panNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        credit_period_days: data.creditPeriodDays,
        credit_limit: data.creditLimit,
        contacts: data.contacts?.length
          ? {
              create: data.contacts.map(c => ({
                name: c.name,
                phone: c.phone,
                email: c.email,
                tags: c.tags || [],
                notes: c.notes,
              })),
            }
          : undefined,
        bank_accounts: data.bankAccounts?.length
          ? {
              create: data.bankAccounts.map((b, i) => ({
                bank_name: b.bankName,
                account_number: b.accountNumber,
                ifsc_code: b.ifscCode,
                branch: b.branch,
                is_primary: b.isPrimary ?? i === 0,
              })),
            }
          : undefined,
      },
      include: { contacts: true, bank_accounts: true },
    });
  }

  async updateParty(partyId: string, businessId: string, data: Record<string, any>) {
    const party = await prisma.party.findFirst({ where: { id: partyId, business_id: businessId } });
    if (!party) throw new NotFoundError('Party');

    // If opening_balance changes, adjust the running balance by the difference
    let balanceAdjustment: any = undefined;
    if (data.openingBalance !== undefined) {
      const oldOpening = Number(party.opening_balance);
      const newOpening = Number(data.openingBalance);
      const diff = newOpening - oldOpening;
      if (Math.abs(diff) > 0.001) {
        balanceAdjustment = { increment: diff };
      }
    }

    // Contacts / bank accounts use replace semantics: when the client sends
    // the array, it is the full desired state (the edit dialog always sends
    // everything it renders). Absent key = leave untouched.
    if (data.contacts !== undefined || data.bankAccounts !== undefined) {
      await prisma.$transaction(async tx => {
        if (data.contacts !== undefined) {
          await tx.partyContact.deleteMany({ where: { party_id: partyId } });
          if (data.contacts.length) {
            await tx.partyContact.createMany({
              data: data.contacts.map((c: any) => ({
                party_id: partyId,
                name: c.name,
                phone: c.phone ?? null,
                email: c.email ?? null,
                tags: c.tags ?? [],
                notes: c.notes ?? null,
              })),
            });
          }
        }
        if (data.bankAccounts !== undefined) {
          await tx.partyBankAccount.deleteMany({ where: { party_id: partyId } });
          if (data.bankAccounts.length) {
            await tx.partyBankAccount.createMany({
              data: data.bankAccounts.map((b: any, i: number) => ({
                party_id: partyId,
                bank_name: b.bankName,
                account_number: b.accountNumber,
                ifsc_code: b.ifscCode,
                branch: b.branch ?? null,
                is_primary: b.isPrimary ?? i === 0,
              })),
            });
          }
        }
      });
    }

    return prisma.party.update({
      where: { id: partyId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.type && { type: data.type }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        ...(data.isMine !== undefined && { is_mine: data.isMine }),
        ...(data.openingBalance !== undefined && { opening_balance: data.openingBalance }),
        ...(balanceAdjustment && { balance: balanceAdjustment }),
        // GST
        ...(data.gstRegistrationType !== undefined && { gst_registration_type: data.gstRegistrationType }),
        ...(data.gstNumber !== undefined && { gst_number: data.gstNumber }),
        ...(data.gstState !== undefined && { gst_state: data.gstState }),
        ...(data.panNumber !== undefined && { pan_number: data.panNumber }),
        // Address
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.pincode !== undefined && { pincode: data.pincode }),
        // Credit
        ...(data.creditPeriodDays !== undefined && { credit_period_days: data.creditPeriodDays }),
        ...(data.creditLimit !== undefined && { credit_limit: data.creditLimit }),
      },
      include: { contacts: true, bank_accounts: true },
    });
  }

  async listParties(businessId: string, query: Record<string, any>) {
    const where: any = { business_id: businessId };
    if (query.type) {
      where.type = query.type;
    } else {
      // Exclude unified CUTTER parties from the default supplier/customer list.
      // They are shown in the dedicated Cutters tab; including them here would
      // mix cutter records into the standard Parties list.
      where.type = { not: 'CUTTER' as any };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }
    if (query.isActive !== undefined) {
      where.is_active = query.isActive === 'true';
    } else if (query.includeInactive !== 'true') {
      // Deactivated parties are hidden by default — otherwise "deactivate"
      // appears to do nothing because the row stays in the list.
      where.is_active = true;
    }
    // Balance type filter (receivable: balance>0, payable: balance<0, settled: balance=0)
    // Sign convention set by the writers: party.balance < 0 => they owe us
    // (receivable); > 0 => we owe them (payable). These two were inverted.
    if (query.balance_type === 'receivable') where.balance = { lt: 0 };
    else if (query.balance_type === 'payable') where.balance = { gt: 0 };
    else if (query.balance_type === 'settled') where.balance = 0;
    // Period filter — the Parties page's AdvancedFilters emits date_from /
    // date_to, which this list used to ignore entirely (the chips appeared,
    // the unfiltered list came back).
    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) {
        // A bare date lands at 00:00, which would exclude parties created
        // later that same day. Push an end-of-day boundary when no time
        // component is given.
        const end = new Date(query.date_to);
        if (!String(query.date_to).includes('T')) end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    return prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { contacts: true, bank_accounts: true },
    });
  }

  async getParty(partyId: string, businessId: string) {
    const party = await prisma.party.findFirst({
      where: { id: partyId, business_id: businessId },
      include: { contacts: true, bank_accounts: true },
    });
    if (!party) throw new NotFoundError('Party');
    return party;
  }

  // ─── CUTTERS ───────────────────────────────────────────
  // Cutters are unified with Parties: every Cutter is mirrored by a Party
  // (type = CUTTER) so its transactions, balance and ledger appear in the
  // unified Party ledger.
  async createCutter(businessId: string, data: {
    name: string; phone?: string; ratePerUnit?: number; unit?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          business_id: businessId,
          name: data.name,
          phone: data.phone,
          type: 'CUTTER' as any,
        },
      });

      return tx.cutter.create({
        data: {
          business_id: businessId,
          name: data.name,
          phone: data.phone,
          rate_per_unit: data.ratePerUnit || 0,
          unit: data.unit || 'KG',
          party_id: party.id,
        },
      });
    });
  }

  async updateCutter(cutterId: string, businessId: string, data: {
    name?: string; phone?: string; ratePerUnit?: number; unit?: string; isActive?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.cutter.update({
        where: { id: cutterId, business_id: businessId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.ratePerUnit !== undefined && { rate_per_unit: data.ratePerUnit }),
          ...(data.unit !== undefined && { unit: data.unit }),
          ...(data.isActive !== undefined && { is_active: data.isActive }),
        },
      });

      // Mirror to the linked Party (name / phone / active flag)
      if (updated.party_id && (data.name !== undefined || data.phone !== undefined || data.isActive !== undefined)) {
        await tx.party.update({
          where: { id: updated.party_id },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.phone !== undefined && { phone: data.phone }),
            ...(data.isActive !== undefined && { is_active: data.isActive }),
          },
        });
      }

      return updated;
    });
  }

  async deleteCutter(cutterId: string, businessId: string) {
    // Soft delete — mark inactive (cutter + linked party)
    return prisma.$transaction(async (tx) => {
      const updated = await tx.cutter.update({
        where: { id: cutterId, business_id: businessId },
        data: { is_active: false },
      });
      if (updated.party_id) {
        await tx.party.update({
          where: { id: updated.party_id },
          data: { is_active: false },
        });
      }
      return updated;
    });
  }

  async createCutterTransaction(
    cutterId: string,
    businessId: string,
    data: { quantity: number; rate: number; notes?: string; isPaid?: boolean; transactionDate?: string },
  ) {
    const cutter = await prisma.cutter.findFirst({
      where: { id: cutterId, business_id: businessId },
      select: { id: true, name: true, party_id: true },
    });
    if (!cutter) throw new NotFoundError('Cutter');

    const amount = data.quantity * data.rate;
    const isPaid = data.isPaid ?? false;

    // Mirror purchase-service: an unpaid cutter cost is money the business
    // owes the cutter's linked Party — it must move the party balance and
    // land in the ledger, or "View in Ledger" and the Parties list disagree
    // with the cutter page forever.
    return prisma.$transaction(async tx => {
      const txn = await tx.cutterTransaction.create({
        data: {
          cutter_id: cutterId,
          quantity: data.quantity,
          rate: data.rate,
          amount,
          notes: data.notes,
          is_paid: isPaid,
          // The dialog collects a transaction date; it was accepted by the
          // signature and then dropped, leaving standalone rows dated only by
          // insertion time.
          ...(data.transactionDate && { created_at: new Date(data.transactionDate) }),
        },
        include: {
          purchase: { select: { id: true, purchase_number: true, purchase_date: true, party: { select: { id: true, name: true } } } },
        },
      });

      if (!isPaid && cutter.party_id) {
        await tx.ledgerEntry.create({
          data: {
            business_id: businessId,
            party_id: cutter.party_id,
            entry_date: data.transactionDate ? new Date(data.transactionDate) : new Date(),
            account_type: 'PARTY_PAYABLE',
            entry_type: 'CREDIT',
            amount,
            narration: `Unpaid cutter cost: ${cutter.name}`,
            reference_type: 'cutter',
            reference_id: txn.id,
          },
        });
        await tx.party.update({
          where: { id: cutter.party_id },
          data: { balance: { increment: amount } },
        });
      }
      return txn;
    });
  }

  async updateCutterTransaction(
    transactionId: string,
    cutterId: string,
    businessId: string,
    data: { isPaid?: boolean; receiptUrl?: string | null; notes?: string | null; quantity?: number; rate?: number },
  ) {
    const cutter = await prisma.cutter.findFirst({
      where: { id: cutterId, business_id: businessId },
      select: { id: true, name: true, party_id: true },
    });
    if (!cutter) throw new NotFoundError('Cutter');

    const existing = await prisma.cutterTransaction.findFirst({
      where: { id: transactionId, cutter_id: cutterId },
      select: { quantity: true, rate: true, amount: true, is_paid: true },
    });
    if (!existing) throw new NotFoundError('Cutter transaction');

    // Recompute amount if qty or rate changed
    let finalAmount: number | undefined;
    if (data.quantity !== undefined || data.rate !== undefined) {
      const q = data.quantity ?? Number(existing.quantity);
      const r = data.rate ?? Number(existing.rate);
      finalAmount = q * r;
    }

    // The unpaid portion of a cutter transaction lives on the linked Party's
    // balance (positive = payable) with a PARTY_PAYABLE ledger leg. Flipping
    // paid/unpaid or changing an unpaid amount must move both, or the party
    // keeps showing money that was already paid (or never owed).
    const oldEffective = existing.is_paid ? 0 : Number(existing.amount);
    const newIsPaid = data.isPaid ?? existing.is_paid;
    const newAmount = finalAmount ?? Number(existing.amount);
    const newEffective = newIsPaid ? 0 : newAmount;
    const delta = newEffective - oldEffective;

    return prisma.$transaction(async tx => {
      const txn = await tx.cutterTransaction.update({
        where: { id: transactionId, cutter_id: cutterId },
        data: {
          ...(data.isPaid !== undefined && { is_paid: data.isPaid }),
          ...(data.receiptUrl !== undefined && { receipt_url: data.receiptUrl }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
          ...(data.rate !== undefined && { rate: data.rate }),
          ...(finalAmount !== undefined && { amount: finalAmount }),
        },
      });

      if (Math.abs(delta) > 0.001 && cutter.party_id) {
        await tx.ledgerEntry.create({
          data: {
            business_id: businessId,
            party_id: cutter.party_id,
            entry_date: new Date(),
            account_type: 'PARTY_PAYABLE',
            entry_type: delta > 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.abs(delta),
            narration:
              delta < 0 && newIsPaid && !existing.is_paid
                ? `Cutter cost paid: ${cutter.name}`
                : `Cutter cost adjusted: ${cutter.name}`,
            reference_type: 'cutter',
            reference_id: transactionId,
          },
        });
        await tx.party.update({
          where: { id: cutter.party_id },
          data: { balance: { increment: delta } },
        });
      }
      return txn;
    });
  }

  async markAllCutterTransactionsPaid(cutterId: string, businessId: string) {
    const cutter = await prisma.cutter.findFirst({
      where: { id: cutterId, business_id: businessId },
      select: { id: true, name: true, party_id: true },
    });
    if (!cutter) throw new NotFoundError('Cutter');

    return prisma.$transaction(async tx => {
      const unpaid = await tx.cutterTransaction.findMany({
        where: { cutter_id: cutterId, is_paid: false },
        select: { id: true, amount: true },
      });
      const result = await tx.cutterTransaction.updateMany({
        where: { cutter_id: cutterId, is_paid: false },
        data: { is_paid: true },
      });

      // Clearing the flags settles the payable: reverse the party balance and
      // write the offsetting DEBIT leg so the ledger agrees with the page.
      const total = unpaid.reduce((s, t) => s + Number(t.amount), 0);
      if (total > 0.001 && cutter.party_id) {
        await tx.ledgerEntry.create({
          data: {
            business_id: businessId,
            party_id: cutter.party_id,
            entry_date: new Date(),
            account_type: 'PARTY_PAYABLE',
            entry_type: 'DEBIT',
            amount: total,
            narration: `Cutter costs paid (${unpaid.length} transactions): ${cutter.name}`,
            reference_type: 'cutter',
            reference_id: cutterId,
          },
        });
        await tx.party.update({
          where: { id: cutter.party_id },
          data: { balance: { decrement: total } },
        });
      }
      return result;
    });
  }

  async listCutters(businessId: string) {
    return prisma.cutter.findMany({
      where: { business_id: businessId, is_active: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { transactions: true } },
      },
    });
  }

  async getCutter(cutterId: string, businessId: string) {
    const cutter = await prisma.cutter.findFirst({
      where: { id: cutterId, business_id: businessId },
      include: {
        _count: { select: { transactions: true } },
        transactions: {
          where: {
            OR: [
              { purchase_id: null }, // standalone (Record Payment)
              { purchase: { status: 'ACTIVE' } }, // only active purchases
            ],
          },
          orderBy: { created_at: 'desc' },
          take: 50,
          include: {
            purchase: {
              select: {
                id: true,
                purchase_number: true,
                purchase_date: true,
                total_amount: true,
                payment_status: true,
                party: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!cutter) throw new NotFoundError('Cutter');

    // Server-side aggregates over ALL matching transactions. The transaction
    // array above is capped at 50, and the page used to derive Total Earned /
    // Unpaid from that slice — badly understated for busy cutters, and
    // "Mark all as paid" could hide while older unpaid rows existed.
    const txnFilter = {
      cutter_id: cutterId,
      OR: [
        { purchase_id: null },
        { purchase: { status: 'ACTIVE' as any } },
      ],
    };
    const [totals, unpaidTotals, filteredCount] = await Promise.all([
      prisma.cutterTransaction.aggregate({
        where: txnFilter,
        _sum: { quantity: true, amount: true },
      }),
      prisma.cutterTransaction.aggregate({
        where: { ...txnFilter, is_paid: false },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.cutterTransaction.count({ where: txnFilter }),
    ]);

    return {
      ...cutter,
      // _count.transactions was unfiltered while the list filtered out
      // cancelled purchases — make the chip and the list agree.
      _count: { transactions: filteredCount },
      aggregates: {
        totalQuantity: Number(totals._sum.quantity || 0),
        totalAmount: Number(totals._sum.amount || 0),
        unpaidAmount: Number(unpaidTotals._sum.amount || 0),
        unpaidCount: unpaidTotals._count,
      },
    };
  }

  // ─── EXPENSE TYPES ────────────────────────────────────
  async createExpenseType(businessId: string, data: { name: string; category: string }) {
    return prisma.expenseType.create({
      data: {
        business_id: businessId,
        name: data.name,
        category: data.category as any,
      },
    });
  }

  async listExpenseTypes(businessId: string) {
    return prisma.expenseType.findMany({
      where: { business_id: businessId, is_active: true },
      orderBy: { name: 'asc' },
    });
  }
}

export const profileService = new ProfileService();
