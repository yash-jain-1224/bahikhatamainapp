import { Prisma, BillingCycle, ReferralStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createLogger, generateReferenceNumber, getPrismaClient, AppError, BadRequestError, NotFoundError } from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('subscription-service');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

// Initialize Razorpay (lazy)
let razorpay: any = null;
function getRazorpay() {
  if (!razorpay && RAZORPAY_KEY_ID) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return razorpay;
}

export class SubscriptionService {
  /**
   * Get all available plans
   */
  async getPlans() {
    return prisma.plan.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    });
  }

  /**
   * Get current subscription for a user (across all their businesses — one plan covers all)
   */
  async getCurrentSubscription(userId: string) {
    // Find all business IDs owned by this user
    const businessUsers = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true },
      select: { business_id: true },
    });
    const businessIds = businessUsers.map((bu: any) => bu.business_id);
    if (businessIds.length === 0) return null;

    // Gate on the period end as well as status — nothing flips a lapsed row
    // out of TRIAL/ACTIVE, so without the time check an expired plan kept
    // being reported as "current", which disabled the renew button for the
    // very plan the locked-out user was trying to re-buy. (auth-service
    // already gates its trial check on time the same way.)
    return prisma.subscription.findFirst({
      where: {
        business_id: { in: businessIds },
        status: { in: ['TRIAL', 'ACTIVE'] },
        current_period_end: { gte: new Date() },
      },
      include: { plan: true },
      orderBy: { current_period_end: 'desc' },
    });
  }

  /**
   * Create/upgrade subscription for a user.
   * One subscription covers ALL businesses — it is always stored on the primary business.
   */
  async createSubscription(userId: string, planId: string, billingCycle: string) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundError('Plan');

    // Always attach the subscription to the user's primary OWNED business so
    // one plan covers all businesses for this user. The membership query MUST
    // be role-scoped: a user invited as staff into someone else's business
    // would otherwise get their upgrade written onto the employer's business
    // (cancelling the employer's live subscription in the process).
    const primaryBusinessUser = await prisma.businessUser.findFirst({
      where: { user_id: userId, is_active: true, role: 'OWNER' },
      include: { business: { select: { id: true, is_primary: true } } },
      orderBy: [{ business: { is_primary: 'desc' } }, { joined_at: 'asc' }],
    });
    if (!primaryBusinessUser) throw new BadRequestError('Create a business before choosing a plan');
    const businessId = primaryBusinessUser.business_id;

    const isFree = plan.slug === 'free' || Number(plan.price_monthly) === 0;

    // Calculate price based on billing cycle
    let price: number;
    switch (billingCycle) {
      case 'QUARTERLY': price = Number(plan.price_quarterly); break;
      case 'HALF_YEARLY': price = Number(plan.price_half_yearly); break;
      case 'YEARLY': price = Number(plan.price_yearly); break;
      default: price = Number(plan.price_monthly); break;
    }

    // Calculate period dates
    const periodStart = new Date();
    const periodEnd = new Date();
    if (isFree) {
      // Free plan = 7-day trial
      periodEnd.setDate(periodEnd.getDate() + 7);
    } else {
      switch (billingCycle) {
        case 'QUARTERLY': periodEnd.setMonth(periodEnd.getMonth() + 3); break;
        case 'HALF_YEARLY': periodEnd.setMonth(periodEnd.getMonth() + 6); break;
        case 'YEARLY': periodEnd.setFullYear(periodEnd.getFullYear() + 1); break;
        default: periodEnd.setMonth(periodEnd.getMonth() + 1); break;
      }
    }

    // Cancel existing subscription
    await prisma.subscription.updateMany({
      where: {
        business_id: businessId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      data: { status: 'CANCELLED', cancelled_at: new Date() },
    });

    // Create Razorpay order for paid plans only
    let razorpayOrderId: string | undefined;
    if (!isFree) {
      const rp = getRazorpay();
      if (rp) {
        try {
          const order = await rp.orders.create({
            amount: price * 100, // Razorpay expects paise
            currency: 'INR',
            receipt: generateReferenceNumber('SUB', businessId),
          });
          razorpayOrderId = order.id;
        } catch (err) {
          logger.error('Razorpay order creation failed', { error: err });
        }
      }
    }

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        id: uuidv4(),
        business_id: businessId,
        plan_id: planId,
        billing_cycle: billingCycle as BillingCycle,
        status: isFree ? 'TRIAL' : (razorpayOrderId ? 'ACTIVE' : 'TRIAL'),
        trial_ends_at: isFree ? periodEnd : undefined,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        razorpay_subscription_id: razorpayOrderId,
      },
      include: { plan: true },
    });

    // Create invoice (skip for free plan)
    let totalAmount = 0;
    if (!isFree && price > 0) {
      const invoiceNumber = generateReferenceNumber('INV', businessId);
      const taxAmount = price * 0.18; // 18% GST
      totalAmount = price + taxAmount;

      await prisma.invoice.create({
        data: {
          id: uuidv4(),
          business_id: businessId,
          subscription_id: subscription.id,
          invoice_number: invoiceNumber,
          amount: new Prisma.Decimal(price),
          tax_amount: new Prisma.Decimal(taxAmount),
          total_amount: new Prisma.Decimal(totalAmount),
          status: 'PENDING',
          razorpay_order_id: razorpayOrderId,
          due_date: periodEnd,
        },
      });
    }

    logger.info('Subscription created', { businessId, planId, billingCycle, isFree });

    // If this is a direct-activate paid subscription (no Razorpay, e.g. manual/admin),
    // trigger first-paid-purchase hook for the business owner.
    if (!isFree && !razorpayOrderId) {
      await this._triggerFirstPaidPurchaseForBusiness(businessId);
    }

    return {
      subscription,
      razorpayOrderId,
      amount: price,
      totalAmount,
    };
  }

  /**
   * Finds the owner of a business and marks their first paid purchase,
   * which credits any pending referral reward.
   */
  private async _triggerFirstPaidPurchaseForBusiness(businessId: string) {
    try {
      const businessOwner = await prisma.businessUser.findFirst({
        where: { business_id: businessId, role: 'OWNER' },
      });
      if (!businessOwner) return;

      // Only trigger if user has not already been marked
      // Cast to include has_paid_plan (added via migration; IDE cache may be stale)
      const user = await prisma.user.findUnique({ where: { id: businessOwner.user_id } }) as
        ({ has_paid_plan: boolean } & Record<string, unknown>) | null;
      if (user && !user.has_paid_plan) {
        await prisma.user.update({
          where: { id: businessOwner.user_id },
          data: { has_paid_plan: true } as Record<string, unknown>,
        });

        // Check for any APPLIED referral and complete it
        const referral = await prisma.referral.findFirst({
          where: { referred_id: businessOwner.user_id, status: 'APPLIED' as ReferralStatus },
        });
        if (referral) {
          await prisma.referral.update({
            where: { id: referral.id },
            data: {
              status: ReferralStatus.COMPLETED,
              reward_amount: new Prisma.Decimal(100),
              reward_credited: true,
              redeemable_days: { increment: 30 },
            } as Record<string, unknown>,
          });
          logger.info('Referral reward auto-credited on first paid purchase', {
            userId: businessOwner.user_id,
            referralId: referral.id,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to trigger first paid purchase hook', { businessId, err });
    }
  }

  /**
   * Handle Razorpay payment webhook
   */
  async handleRazorpayWebhook(rawBody: Buffer, signature: string) {
    // Fail closed when the secret is not configured — an empty-secret HMAC
    // would accept nothing legitimate but still 500 on every callback.
    if (!RAZORPAY_WEBHOOK_SECRET) {
      throw new AppError('Razorpay webhook is not configured', 503);
    }
    if (!signature) {
      throw new BadRequestError('Missing x-razorpay-signature header');
    }

    // HMAC over the raw request bytes (not a re-serialized JSON body), with a
    // constant-time compare. 400 (not 500) on mismatch so Razorpay does not
    // retry-storm an invalid request.
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestError('Invalid webhook signature');
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const event = body.event;
    const payment = body.payload?.payment?.entity;

    logger.info('Razorpay webhook received', { event, paymentId: payment?.id });

    switch (event) {
      case 'payment.captured': {
        // Find invoice by Razorpay order ID
        const invoice = await prisma.invoice.findFirst({
          where: { razorpay_order_id: payment.order_id },
        });

        if (invoice) {
          // Update invoice
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'PAID',
              razorpay_payment_id: payment.id,
              paid_at: new Date(),
            },
          });

          // Activate subscription
          const activatedSub = await prisma.subscription.update({
            where: { id: invoice.subscription_id },
            data: { status: 'ACTIVE' },
            select: { business_id: true },
          });

          // Trigger first-paid-purchase hook (credits referral reward if applicable)
          await this._triggerFirstPaidPurchaseForBusiness(activatedSub.business_id);

          logger.info('Payment captured, subscription activated', {
            invoiceId: invoice.id,
            paymentId: payment.id,
          });
        }
        break;
      }
      case 'payment.failed': {
        const failedInvoice = await prisma.invoice.findFirst({
          where: { razorpay_order_id: payment.order_id },
        });

        if (failedInvoice) {
          await prisma.invoice.update({
            where: { id: failedInvoice.id },
            data: { status: 'FAILED' },
          });

          await prisma.subscription.update({
            where: { id: failedInvoice.subscription_id },
            data: { status: 'PAST_DUE' },
          });
        }
        break;
      }
    }

    return { received: true };
  }

  /**
   * Get invoices for a user (across all their businesses)
   */
  async getInvoices(userId: string) {
    // OWNER-scoped: a staff member must not read their employer's billing
    // history (amounts, plan, GST invoice numbers).
    const businessUsers = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true, role: 'OWNER' },
      select: { business_id: true },
    });
    const businessIds = businessUsers.map((bu: any) => bu.business_id);

    return prisma.invoice.findMany({
      where: { business_id: { in: businessIds } },
      include: { subscription: { include: { plan: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Cancel subscription for a user (cancels the active subscription across all their businesses)
   */
  async cancelSubscription(userId: string) {
    // Only businesses the caller OWNS: a STAFF/ACCOUNTANT invited into
    // someone else's business must not be able to cancel the owner's plan
    // (which locks every member out of the app).
    const businessUsers = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true, role: 'OWNER' },
      select: { business_id: true },
    });
    const businessIds = businessUsers.map((bu: any) => bu.business_id);

    const subscription = await prisma.subscription.findFirst({
      where: {
        business_id: { in: businessIds },
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
    });

    if (!subscription) throw new NotFoundError('Active subscription');

    // Cancel at PERIOD END, not instantly. There is no auto-renewal in the
    // platform — a subscription simply lapses when current_period_end passes —
    // so flipping status to CANCELLED here would revoke access the user
    // already paid for. Record the intent and let the period run out.
    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelled_at: new Date(),
      },
    });
  }
}

export const subscriptionService = new SubscriptionService();
