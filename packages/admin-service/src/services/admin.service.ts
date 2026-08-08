import { v4 as uuidv4 } from 'uuid';
import {
  createLogger, parsePagination, getPaginationOffset, buildPaginationMeta,
  NotFoundError, ConflictError, ForbiddenError,
  getPrismaClient, clearPlatformSettingsCache,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('admin-service');

export class AdminService {
  // ─── PLATFORM DASHBOARD ─────────────────────────────────
  async getPlatformDashboard() {
    // "Today" means the calendar day where the users are, not where the server
    // is. The user base is Indian, so anchor to IST (UTC+5:30, no DST) —
    // measuring from midnight UTC would have counted 05:30 IST as the boundary.
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const nowMs = Date.now();
    const istNow = new Date(nowMs + IST_OFFSET_MS);
    const startOfIstDay = new Date(Date.UTC(
      istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(),
    ).valueOf() - IST_OFFSET_MS);
    const startOfWeek = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, totalBusinesses, activeSubscriptions,
      totalRevenue, totalPurchases, totalSales,
      newUsersToday, newUsersThisWeek, churnedSubscriptions, totalSubscriptions,
      recentSignups, recentBusinesses,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { total_amount: true },
      }),
      prisma.purchase.count(),
      prisma.sale.count(),
      prisma.user.count({ where: { created_at: { gte: startOfIstDay } } }),
      prisma.user.count({ where: { created_at: { gte: startOfWeek } } }),
      prisma.subscription.count({ where: { status: { in: ['CANCELLED', 'EXPIRED'] } } }),
      prisma.subscription.count(),
      prisma.user.findMany({ orderBy: { created_at: 'desc' }, take: 10, select: { id: true, phone: true, name: true, created_at: true } }),
      prisma.business.findMany({ orderBy: { created_at: 'desc' }, take: 10, select: { id: true, name: true, type: true, city: true, created_at: true } }),
    ]);

    const revenue = Number(totalRevenue._sum.total_amount || 0);

    return {
      totalUsers,
      totalBusinesses,
      activeSubscriptions,
      totalRevenue: revenue,
      // The dashboard reads `revenue`; keep both names so neither the tile nor
      // any existing consumer depends on the other being renamed.
      revenue,
      totalPurchases,
      totalSales,
      newUsersToday,
      newUsersThisWeek,
      // Share of all subscriptions ever created that ended in CANCELLED or
      // EXPIRED. A lifetime rate, not a monthly one — but a real figure derived
      // from real rows, which the hardcoded 2.3% on the client was not.
      churnRate: totalSubscriptions > 0
        ? Math.round((churnedSubscriptions / totalSubscriptions) * 1000) / 10
        : 0,
      avgRevenuePerUser: totalUsers > 0 ? Math.round(revenue / totalUsers) : 0,
      recentSignups,
      recentBusinesses,
    };
  }

  // ─── USER MANAGEMENT ───────────────────────────────────
  async listUsers(query: Record<string, any>) {
    const { page, limit, sortBy, sortOrder } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = {};
    if (query.search) {
      where.OR = [
        { phone: { contains: query.search } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) where.is_active = query.isActive === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, phone: true, name: true, email: true, avatar_url: true,
          is_active: true, is_super_admin: true, created_at: true,
          _count: { select: { business_users: true } },
          business_users: {
            take: 1,
            include: {
              business: {
                include: {
                  subscriptions: {
                    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
                    take: 1,
                    include: { plan: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
        orderBy: { [sortBy || 'created_at']: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Transform to the shape the frontend expects
    const data = users.map((u: any) => {
      const activeSub = u.business_users?.[0]?.business?.subscriptions?.[0];
      return {
        id: u.id,
        name: u.name || 'Unnamed',
        phone: u.phone,
        email: u.email,
        businesses: u._count?.business_users || 0,
        plan: activeSub?.plan?.name || 'Free',
        status: u.is_active ? 'ACTIVE' : 'SUSPENDED',
        is_super_admin: u.is_super_admin,
        created_at: u.created_at,
      };
    });

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async getUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        business_users: {
          include: {
            business: { select: { id: true, name: true, type: true } },
            permissions: true,
          },
        },
        _count: { select: { referrals_made: true, notifications: true } },
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /**
   * A super admin taking themselves (or the last remaining super admin) out
   * of play permanently locks the platform out of /admin — there is no
   * in-app path to restore access. Guard all three mutators.
   */
  private async assertNotLastSuperAdmin(targetUserId: string, verb: string) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { is_super_admin: true },
    });
    if (!target?.is_super_admin) return;
    const count = await prisma.user.count({ where: { is_super_admin: true, is_active: true } });
    if (count <= 1) {
      throw new ConflictError(
        `Cannot ${verb} the last active super admin. Grant super-admin access to another account first.`,
      );
    }
  }

  async toggleUserStatus(userId: string, isActive: boolean, actingUserId?: string) {
    if (!isActive) {
      if (actingUserId && actingUserId === userId) {
        throw new ForbiddenError('You cannot suspend your own account');
      }
      await this.assertNotLastSuperAdmin(userId, 'suspend');
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { is_active: isActive },
    });

    // Revoke sessions on suspend. auth-service now refuses to refresh an
    // inactive user, but their *current* access token stays valid until it
    // expires; dropping the refresh tokens means the session cannot outlive
    // that window instead of rotating onwards indefinitely.
    if (!isActive) {
      const { count } = await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
      logger.info('Revoked refresh tokens for deactivated user', { userId, count });
    }

    return user;
  }

  async toggleSuperAdmin(userId: string, isSuperAdmin: boolean, actingUserId?: string) {
    if (!isSuperAdmin) {
      if (actingUserId && actingUserId === userId) {
        throw new ForbiddenError('You cannot remove your own super-admin access');
      }
      await this.assertNotLastSuperAdmin(userId, 'demote');
    }
    return prisma.user.update({
      where: { id: userId },
      data: { is_super_admin: isSuperAdmin },
    });
  }

  async deleteUser(userId: string, actingUserId?: string) {
    if (actingUserId && actingUserId === userId) {
      throw new ForbiddenError('You cannot delete your own account');
    }
    await this.assertNotLastSuperAdmin(userId, 'delete');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    // Most relations to User do cascade, but Referral.referrer does not: it is a
    // required relation with no onDelete, so Prisma defaults it to Restrict.
    // Deleting anyone who had ever referred someone therefore raised a raw
    // P2003, which the error handler reports in production as a bare 500
    // "Internal server error" — no indication of what actually blocked it.
    const referralCount = await prisma.referral.count({ where: { referrer_id: userId } });
    if (referralCount > 0) {
      throw new ConflictError(
        `Cannot delete this user: they are the referrer on ${referralCount} referral record(s). ` +
        `Deleting them would destroy the reward history attached to those referrals.`,
      );
    }

    // The remaining relations (sessions, business links, audit logs) cascade or
    // set null per the schema.
    return prisma.user.delete({ where: { id: userId } });
  }

  // ─── CREATE USER (Admin - for cash/offline customers) ──
  async createUser(data: {
    phone: string; name: string; email?: string;
    isSuperAdmin?: boolean;
  }) {
    // Check if user with this phone already exists
    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) {
      // Bare Error meant the handler treated this as unexpected and replaced the
      // message with "Internal server error" in production, so the admin never
      // learned the phone was already taken.
      throw new ConflictError('User with this phone already exists');
    }

    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        phone: data.phone,
        name: data.name,
        email: data.email || undefined,
        is_super_admin: data.isSuperAdmin || false,
        is_active: true,
      },
    });

    logger.info('Admin created user', { userId: user.id, phone: data.phone });
    return user;
  }

  // ─── CREATE BUSINESS (Admin - for cash/offline customers) ──
  async createBusiness(data: {
    name: string; type?: string; ownerId: string;
    phone?: string; email?: string;
    gstNumber?: string; panNumber?: string;
    address?: string; city?: string; state?: string; pincode?: string;
  }) {
    const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
    if (!owner) throw new NotFoundError('Owner user');

    const business = await prisma.business.create({
      data: {
        id: uuidv4(),
        name: data.name,
        type: (data.type as any) || 'TRADING',
        phone: data.phone,
        email: data.email,
        gst_number: data.gstNumber,
        pan_number: data.panNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
      },
    });

    // Add owner as BusinessUser with OWNER role
    const businessUser = await prisma.businessUser.create({
      data: {
        id: uuidv4(),
        user_id: data.ownerId,
        business_id: business.id,
        role: 'OWNER',
      },
    });

    // Grant all permissions to owner
    const allPermissions = [
      'PURCHASE_CREATE', 'PURCHASE_EDIT', 'PURCHASE_DELETE', 'PURCHASE_VIEW',
      'SALE_CREATE', 'SALE_EDIT', 'SALE_DELETE', 'SALE_VIEW',
      'INVENTORY_CREATE', 'INVENTORY_EDIT', 'INVENTORY_VIEW',
      'LEDGER_EDIT', 'LEDGER_VIEW',
      'PAYMENT_CREATE', 'PAYMENT_VIEW',
      'REPORT_VIEW',
      'PARTY_CREATE', 'PARTY_EDIT', 'PARTY_VIEW',
      'SETTINGS_EDIT',
    ];

    await prisma.businessUserPermission.createMany({
      data: allPermissions.map((p: string) => ({
        id: uuidv4(),
        business_user_id: businessUser.id,
        permission: p as any,
      })),
    });

    // Auto-assign Free plan so every business starts with an active subscription
    const freePlan = await prisma.plan.findFirst({ where: { slug: 'free' } });
    if (freePlan) {
      await prisma.subscription.create({
        data: {
          id: uuidv4(),
          business_id: business.id,
          plan_id: freePlan.id,
          billing_cycle: 'MONTHLY',
          status: 'ACTIVE',
          current_period_start: new Date(),
          current_period_end: new Date('2099-12-31'),
        },
      });
    }

    logger.info('Admin created business', { businessId: business.id, ownerId: data.ownerId });
    return business;
  }

  // ─── MANUAL SUBSCRIPTION (Admin - for cash/offline payments) ──
  async createManualSubscription(data: {
    businessId: string; planId: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
    paymentMode: string; paymentRef?: string; amount: number;
    notes?: string;
  }) {
    const business = await prisma.business.findUnique({ where: { id: data.businessId } });
    if (!business) throw new NotFoundError('Business');

    const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan) throw new NotFoundError('Plan');

    // Calculate period based on billing cycle
    const now = new Date();
    const periodEnd = new Date(now);
    switch (data.billingCycle) {
      case 'MONTHLY': periodEnd.setMonth(periodEnd.getMonth() + 1); break;
      case 'QUARTERLY': periodEnd.setMonth(periodEnd.getMonth() + 3); break;
      case 'HALF_YEARLY': periodEnd.setMonth(periodEnd.getMonth() + 6); break;
      case 'YEARLY': periodEnd.setFullYear(periodEnd.getFullYear() + 1); break;
    }

    // Deactivate any existing active subscription
    await prisma.subscription.updateMany({
      where: { business_id: data.businessId, status: { in: ['ACTIVE', 'TRIAL'] } },
      data: { status: 'EXPIRED' },
    });

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        id: uuidv4(),
        business_id: data.businessId,
        plan_id: data.planId,
        billing_cycle: data.billingCycle as any,
        status: 'ACTIVE',
        current_period_start: now,
        current_period_end: periodEnd,
      },
    });

    // Create paid invoice
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const taxAmount = data.amount * 0.18; // 18% GST
    const totalAmount = data.amount + taxAmount;

    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        business_id: data.businessId,
        subscription_id: subscription.id,
        invoice_number: invoiceNumber,
        amount: data.amount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'PAID',
        paid_at: now,
        due_date: now,
        // These three were collected by the dialog, shown back in its Purchase
        // Summary, and then discarded — leaving no record of how the money was
        // taken or against which receipt/cheque number.
        payment_mode: data.paymentMode || null,
        payment_ref: data.paymentRef || null,
        notes: data.notes || null,
      },
    });

    logger.info('Admin created manual subscription', {
      subscriptionId: subscription.id,
      businessId: data.businessId,
      planId: data.planId,
      paymentMode: data.paymentMode,
      amount: totalAmount,
    });

    return { subscription, invoice };
  }

  // ─── BUSINESS MANAGEMENT ───────────────────────────────
  async listBusinesses(query: Record<string, any>) {
    const { page, limit, sortBy, sortOrder } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.is_active = query.isActive === 'true';

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          subscriptions: { where: { status: { in: ['ACTIVE', 'TRIAL'] } }, take: 1, include: { plan: true } },
          business_users: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, name: true, phone: true } } },
          },
          _count: { select: { business_users: true, purchases: true, sales: true } },
          // Needed for the Revenue column, which was hardcoded to 0 below.
          invoices: { where: { status: 'PAID' }, select: { total_amount: true } },
        },
        orderBy: { [sortBy || 'created_at']: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.business.count({ where }),
    ]);

    // Transform to the shape the frontend expects
    const data = businesses.map((b: any) => {
      const owner = b.business_users?.[0]?.user;
      const activeSub = b.subscriptions?.[0];
      return {
        id: b.id,
        name: b.name,
        type: b.type || 'OTHER',
        owner_name: owner?.name || 'N/A',
        owner_phone: owner?.phone || b.phone || '',
        gst_number: b.gst_number,
        city: b.city,
        state: b.state,
        plan: activeSub?.plan?.name || 'Free',
        // The row action is labelled "Suspend" and writes is_active:false, so
        // emit SUSPENDED for that state — the filter dropdown offers it and it
        // could never match before (both ternary branches said ACTIVE).
        status: !b.is_active ? 'SUSPENDED' : 'ACTIVE',
        users_count: b._count?.business_users || 0,
        transactions_count: (b._count?.purchases || 0) + (b._count?.sales || 0),
        // Was a literal 0, which the Businesses page rendered as the Revenue
        // column and then summed into the "Total Revenue" and "Avg. Revenue/Biz"
        // tiles — and exported to CSV. Every one of those read ₹0 regardless of
        // what the business had actually paid.
        revenue: (b.invoices ?? []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
        created_at: b.created_at,
        last_active: b.updated_at,
      };
    });

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async getBusinessDetail(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        subscriptions: { include: { plan: true }, orderBy: { created_at: 'desc' } },
        business_users: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
        _count: {
          select: {
            purchases: true, sales: true, lots: true,
            inventory_items: true, parties: true, audit_logs: true,
          },
        },
      },
    });
    if (!business) throw new NotFoundError('Business');
    return business;
  }

  async toggleBusinessStatus(businessId: string, isActive: boolean) {
    return prisma.business.update({
      where: { id: businessId },
      data: { is_active: isActive },
    });
  }

  async deleteBusiness(businessId: string) {
    const business = await prisma.business.findUnique({ where: { id: businessId } }) as any;
    if (!business) throw new NotFoundError('Business');
    if (business.is_primary) {
      throw new ConflictError('Primary business cannot be deleted. It can only be edited.');
    }
    // Cascade deletes are configured in the schema
    return prisma.business.delete({ where: { id: businessId } });
  }

  // ─── PLAN MANAGEMENT ──────────────────────────────────
  async listPlans() {
    // The Plans page reads `subscriber_count` and `revenue` per plan. Neither
    // was returned, so every card read "0 subscribers · ₹0 MRR" and — worse —
    // the delete dialog said "This will affect 0 subscribers" for a plan with
    // hundreds, inviting a destructive click that then failed with a 500.
    const plans = await prisma.plan.findMany({
      orderBy: { sort_order: 'asc' },
      include: {
        _count: { select: { subscriptions: true } },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          select: {
            id: true,
            invoices: { where: { status: 'PAID' }, select: { total_amount: true } },
          },
        },
      },
    });

    return plans.map((p: any) => {
      const activeSubs = p.subscriptions ?? [];
      const revenue = activeSubs.reduce(
        (sum: number, s: any) =>
          sum + (s.invoices ?? []).reduce((t: number, i: any) => t + Number(i.total_amount || 0), 0),
        0,
      );
      const { subscriptions, _count, ...plan } = p;
      return {
        ...plan,
        // Active/trial subscribers — what the card and the delete dialog mean.
        subscriber_count: activeSubs.length,
        // Every subscription ever on this plan, which is what actually blocks a
        // delete (the FK is RESTRICT and ignores status).
        total_subscription_count: _count?.subscriptions ?? 0,
        revenue,
      };
    });
  }

  async createPlan(data: {
    name: string; slug: string; description?: string;
    priceMonthly: number; priceQuarterly: number;
    priceHalfYearly: number; priceYearly: number;
    maxBusinesses?: number; maxUsers?: number; maxShops?: number;
    features?: Record<string, any>; sortOrder?: number;
  }) {
    return prisma.plan.create({
      data: {
        id: uuidv4(),
        name: data.name,
        slug: data.slug,
        description: data.description,
        price_monthly: data.priceMonthly,
        price_quarterly: data.priceQuarterly,
        price_half_yearly: data.priceHalfYearly,
        price_yearly: data.priceYearly,
        max_businesses: data.maxBusinesses || 1,
        max_users: data.maxUsers || 2,
        max_shops: data.maxShops || 1,
        features: data.features ? JSON.parse(JSON.stringify(data.features)) : undefined,
        sort_order: data.sortOrder || 0,
      },
    });
  }

  async updatePlan(planId: string, data: Record<string, any>) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundError('Plan');

    return prisma.plan.update({
      where: { id: planId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priceMonthly !== undefined && { price_monthly: data.priceMonthly }),
        ...(data.priceQuarterly !== undefined && { price_quarterly: data.priceQuarterly }),
        ...(data.priceHalfYearly !== undefined && { price_half_yearly: data.priceHalfYearly }),
        ...(data.priceYearly !== undefined && { price_yearly: data.priceYearly }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        ...(data.features !== undefined && { features: JSON.parse(JSON.stringify(data.features)) }),
        ...(data.maxBusinesses !== undefined && { max_businesses: data.maxBusinesses }),
        ...(data.maxUsers !== undefined && { max_users: data.maxUsers }),
        ...(data.maxShops !== undefined && { max_shops: data.maxShops }),
        ...(data.slug && { slug: data.slug }),
      },
    });
  }

  async deletePlan(planId: string) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundError('Plan');

    // Subscription.plan is a required relation with no onDelete, so Postgres
    // restricts the delete while ANY subscription still points at the plan --
    // not just the ACTIVE/TRIAL ones this used to count. A plan whose
    // subscriptions had all expired passed the guard and then died on a raw
    // P2003, surfacing in production as a bare 500 "Internal server error".
    const [activeSubCount, totalSubCount] = await Promise.all([
      prisma.subscription.count({
        where: { plan_id: planId, status: { in: ['ACTIVE', 'TRIAL'] } },
      }),
      prisma.subscription.count({ where: { plan_id: planId } }),
    ]);
    if (activeSubCount > 0) {
      throw new ConflictError(
        `Cannot delete plan with ${activeSubCount} active subscription(s). Deactivate them first.`,
      );
    }
    if (totalSubCount > 0) {
      throw new ConflictError(
        `Cannot delete plan: ${totalSubCount} past subscription(s) still reference it. ` +
        `Deactivate the plan instead so the billing history stays intact.`,
      );
    }

    return prisma.plan.delete({ where: { id: planId } });
  }

  // ─── PLATFORM SETTINGS (stored as feature flags with null business_id) ──
  async getSettings() {
    const flags = await prisma.featureFlag.findMany({
      where: { business_id: null, feature: { startsWith: 'PLATFORM_' } },
    });
    // Convert to key-value settings object.
    // updateSettings stores a scalar as the envelope { value: X } and an object
    // as-is, so the read has to unwrap symmetrically. It used to return
    // flag.config verbatim, which meant a boolean saved as `false` came back as
    // `{ value: false }` — an object, and therefore truthy. Every toggle on the
    // Platform Settings screen read as ON no matter what was stored, and
    // switching one off then reloading showed it back ON.
    const settings: Record<string, any> = {};
    for (const flag of flags) {
      const key = flag.feature.replace('PLATFORM_', '');
      const config = flag.config as Record<string, any> | null;
      if (config && typeof config === 'object' && !Array.isArray(config)
          && Object.keys(config).length === 1 && 'value' in config) {
        // The scalar envelope written by updateSettings. Checking for a lone
        // `value` key keeps a genuine object setting that happens to contain a
        // `value` field from being unwrapped by mistake.
        settings[key] = config.value;
      } else if (config && typeof config === 'object') {
        settings[key] = config;
      } else {
        settings[key] = flag.is_enabled;
      }
    }
    return settings;
  }

  async updateSettings(data: Record<string, any>) {
    const results: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      const feature = `PLATFORM_${key}`;
      const existing = await prisma.featureFlag.findFirst({
        where: { business_id: null, feature },
      });
      if (existing) {
        const updated = await prisma.featureFlag.update({
          where: { id: existing.id },
          data: {
            is_enabled: typeof value === 'boolean' ? value : true,
            config: typeof value === 'object' ? value : { value },
          },
        });
        results.push(updated);
      } else {
        const created = await prisma.featureFlag.create({
          data: {
            id: uuidv4(),
            feature,
            is_enabled: typeof value === 'boolean' ? value : true,
            config: typeof value === 'object' ? value : { value },
          },
        });
        results.push(created);
      }
    }
    // Drop this process's cached copy so a change is visible here immediately.
    // Other services pick it up within their own cache TTL.
    clearPlatformSettingsCache();
    return results;
  }

  // ─── INVOICES ───────────────────────────────────────────
  async listInvoices(query: Record<string, any>) {
    const { page, limit, sortBy, sortOrder } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.businessId) where.business_id = query.businessId;
    if (query.search) {
      where.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        { business: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, phone: true, email: true, gst_number: true, address: true, city: true, state: true, pincode: true } },
          subscription: {
            include: {
              plan: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { [sortBy || 'created_at']: sortOrder || 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data: invoices, meta: buildPaginationMeta(total, page, limit) };
  }

  async getInvoiceDetail(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        business: {
          select: {
            id: true, name: true, phone: true, email: true,
            gst_number: true, address: true, city: true, state: true, pincode: true,
          },
        },
        subscription: {
          include: {
            plan: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    return invoice;
  }

  // ─── AUDIT LOGS ────────────────────────────────────────
  async getAuditLogs(query: Record<string, any>) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = {};
    if (query.businessId) where.business_id = query.businessId;
    if (query.userId) where.user_id = query.userId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entity_type = query.entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          business: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: buildPaginationMeta(total, page, limit) };
  }

  // ─── FEATURE FLAGS ─────────────────────────────────────
  async getFeatureFlags(businessId?: string) {
    // Platform Settings are stored in the same feature_flags table as
    // PLATFORM_*-prefixed rows (see getSettings/updateSettings above); keep
    // them out of the feature-flag listing.
    return prisma.featureFlag.findMany({
      where: {
        ...(businessId ? { business_id: businessId } : {}),
        feature: { not: { startsWith: 'PLATFORM_' } },
      },
      orderBy: { feature: 'asc' },
    });
  }

  async toggleFeatureFlag(flagId: string, isEnabled: boolean) {
    return prisma.featureFlag.update({
      where: { id: flagId },
      data: { is_enabled: isEnabled },
    });
  }

  async createFeatureFlag(data: { businessId?: string; feature: string; isEnabled: boolean; config?: Record<string, any> }) {
    return prisma.featureFlag.create({
      data: {
        id: uuidv4(),
        business_id: data.businessId,
        feature: data.feature,
        is_enabled: data.isEnabled,
        config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
      },
    });
  }

  // ─── SUBSCRIPTIONS ─────────────────────────────────────
  /**
   * There was no list-subscriptions endpoint at all, so /admin/subscriptions
   * read `recentSubscriptions` off the analytics response — a key that response
   * never contained — and its `|| defaultSubs` fallback swapped in four
   * hardcoded rows ("Sharma Trading Co.", ₹4999, INV-2024-001…) even on a
   * 200 OK. Admins could search, filter and export invented subscriptions while
   * a real purchase made seconds earlier never appeared.
   */
  async listSubscriptions(query: Record<string, any>) {
    const { page, limit, sortBy, sortOrder } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.businessId) where.business_id = query.businessId;
    if (query.search) {
      where.business = { name: { contains: query.search, mode: 'insensitive' } };
    }

    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          business: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true, price_monthly: true, price_yearly: true } },
          // Newest invoice carries the amount actually charged and its number.
          invoices: { orderBy: { created_at: 'desc' }, take: 1 },
        },
        orderBy: { [sortBy || 'created_at']: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.subscription.count({ where }),
    ]);

    // Flatten to exactly the shape the admin table renders.
    const data = subs.map((s: any) => {
      const invoice = s.invoices?.[0];
      return {
        id: s.id,
        business_id: s.business_id,
        business_name: s.business?.name || 'Unknown',
        plan_name: s.plan?.name || 'Unknown',
        billing_cycle: s.billing_cycle,
        status: s.status,
        // Now recorded on the invoice for manual/offline purchases. Fall back to
        // inferring RAZORPAY from the gateway id, and to null rather than
        // inventing "CASH" when neither is known.
        payment_mode: invoice?.payment_mode
          || (invoice?.razorpay_payment_id ? 'RAZORPAY' : null),
        payment_ref: invoice?.payment_ref || invoice?.razorpay_payment_id || null,
        notes: invoice?.notes || null,
        amount: invoice ? Number(invoice.total_amount) : null,
        start_date: s.current_period_start,
        end_date: s.current_period_end,
        created_at: s.created_at,
        invoice_number: invoice?.invoice_number || null,
      };
    });

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ─── SUBSCRIPTION ANALYTICS ────────────────────────────
  async getSubscriptionAnalytics() {
    const [byStatus, byPlan, monthlyRevenue, cashPayments] = await Promise.all([
      prisma.subscription.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.$queryRaw<Array<{ plan_name: string; count: number }>>`
        SELECT p.name as plan_name, COUNT(s.id)::int as count
        FROM subscriptions s JOIN plans p ON s.plan_id = p.id
        GROUP BY p.name ORDER BY count DESC
      `,
      prisma.$queryRaw<Array<{ month: string; revenue: number }>>`
        SELECT TO_CHAR(paid_at, 'YYYY-MM') as month, 
               SUM(total_amount)::float as revenue
        FROM invoices WHERE status = 'PAID' AND paid_at IS NOT NULL
        GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
        ORDER BY month DESC LIMIT 12
      `,
      // Now computable: payment_mode is persisted on manual purchases. Anything
      // not recorded through an online gateway counts as collected offline.
      prisma.invoice.count({ where: { status: 'PAID', payment_mode: 'CASH' } }),
    ]);

    // The Subscriptions page reads totalActive / totalRevenue / mrr, none of
    // which were returned — so all three tiles rendered 0 on every successful
    // load no matter how many paying businesses existed. Derived here from the
    // aggregates already computed above rather than left to the client.
    const totalActive = byStatus
      .filter((s: any) => s.status === 'ACTIVE')
      .reduce((n: number, s: any) => n + (typeof s._count === 'number' ? s._count : s._count?._all ?? 0), 0);
    const totalRevenue = monthlyRevenue.reduce((sum, m) => sum + Number(m.revenue || 0), 0);
    // monthlyRevenue is ordered month DESC, so the head is the most recent
    // month with any paid invoice.
    const mrr = Number(monthlyRevenue[0]?.revenue ?? 0);

    return { byStatus, byPlan, monthlyRevenue, totalActive, totalRevenue, mrr, cashPayments };
  }
}

export const adminService = new AdminService();
