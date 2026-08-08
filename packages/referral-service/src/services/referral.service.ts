import { Prisma, ReferralStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger, NotFoundError, BadRequestError, ConflictError,
  getPrismaClient,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('referral-service');

// ₹100 reward = 30 days of subscription extension per successful referral
const REFERRAL_REWARD_AMOUNT = 100;
const REFERRAL_REWARD_DAYS = 30;

// ---------------------------------------------------------------------------
// Local interfaces that mirror the DB schema exactly.
// Using these instead of Prisma's generated types avoids IDE false errors
// when the language server has a stale generated-client cache.
// tsc always compiles cleanly against the real generated client.
// ---------------------------------------------------------------------------
interface DbUser {
  id: string;
  has_paid_plan: boolean;
  [key: string]: unknown;
}

interface DbReferral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  referral_code: string;
  status: string;
  reward_amount: Prisma.Decimal;
  reward_credited: boolean;
  redeemable_days: number;
  redeemed_days: number;
  redeemed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DbReferralWithReferred extends DbReferral {
  referred: { id: string; name: string | null; phone: string; created_at: Date } | null;
}

// ---------------------------------------------------------------------------

function generateReferralCode(): string {
  return `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

/**
 * Returns true if the user is eligible for referrals.
 * Primary check: has_paid_plan flag.
 * Fallback: user has any active/trial non-free subscription (auto-heals stale flag).
 */
async function isUserEligible(userId: string): Promise<boolean> {
  const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
  if (!user) return false;
  if (user.has_paid_plan) return true;

  // Fallback: check live subscription data
  const paidSub = await prisma.businessUser.findFirst({
    where: { user_id: userId, role: 'OWNER' },
    include: {
      business: {
        include: {
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIAL'] } },
            include: { plan: { select: { slug: true } } },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  const sub = paidSub?.business?.subscriptions?.[0];
  const hasPaidSub = !!sub && sub.plan.slug !== 'free';

  // Auto-heal the flag so future checks are fast
  if (hasPaidSub) {
    await prisma.user.update({
      where: { id: userId },
      data: { has_paid_plan: true } as Record<string, unknown>,
    });
  }

  return hasPaidSub;
}

export class ReferralService {
  // ─────────────────────────────────────────────────────────────
  // Get or create a referral code for a user.
  // Rule 4: Only users with a paid plan can generate/share referrals.
  // ─────────────────────────────────────────────────────────────
  async getOrCreateReferralCode(userId: string) {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
    if (!user) throw new NotFoundError('User');

    if (!(await isUserEligible(userId))) {
      throw new BadRequestError(
        'You need an active paid plan to generate a referral code. Upgrade to unlock referrals.',
      );
    }

    const existing = (await prisma.referral.findFirst({
      where: { referrer_id: userId, referred_id: null },
    })) as DbReferral | null;
    if (existing) return existing;

    const referral = (await prisma.referral.create({
      data: {
        id: uuidv4(),
        referrer_id: userId,
        referral_code: generateReferralCode(),
        status: ReferralStatus.PENDING,
      },
    })) as DbReferral;

    logger.info('Referral code created', { userId, code: referral.referral_code });
    return referral;
  }

  // ─────────────────────────────────────────────────────────────
  // Apply a referral code during first paid purchase checkout.
  // Sets status to APPLIED — reward fires only on first paid purchase.
  // ─────────────────────────────────────────────────────────────
  async applyReferralCode(userId: string, code: string) {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
    if (!user) throw new NotFoundError('User');

    // Rule 6: Cannot apply referral if already on a paid plan
    if (user.has_paid_plan) {
      throw new BadRequestError(
        'Referral codes can only be applied during your first paid plan purchase.',
      );
    }

    const referral = (await prisma.referral.findUnique({
      where: { referral_code: code },
    })) as DbReferral | null;
    if (!referral) throw new NotFoundError('Referral code');
    if (referral.referrer_id === userId) {
      throw new BadRequestError('You cannot use your own referral code.');
    }
    if (referral.referred_id) {
      throw new ConflictError('This referral code has already been used.');
    }

    // Rule 3: One-time referral usage per user
    const alreadyUsed = await prisma.referral.findFirst({ where: { referred_id: userId } });
    if (alreadyUsed) {
      throw new ConflictError('You have already applied a referral code.');
    }

    // Mark as APPLIED — reward credited only after first paid purchase
    const updated = (await prisma.referral.update({
      where: { id: referral.id },
      data: { referred_id: userId, status: 'APPLIED' as ReferralStatus },
    })) as DbReferral;

    logger.info('Referral code applied (pending first paid purchase)', {
      userId, code, referrerId: referral.referrer_id,
    });
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // Called after a user's first successful paid plan purchase.
  // Completes any APPLIED referral and credits reward to referrer.
  // Also marks user.has_paid_plan = true.
  // ─────────────────────────────────────────────────────────────
  async handleFirstPaidPurchase(userId: string) {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
    if (!user) throw new NotFoundError('User');

    // Idempotent: skip if already processed
    if (user.has_paid_plan) return null;

    // Mark user as having made their first paid purchase
    await prisma.user.update({
      where: { id: userId },
      data: { has_paid_plan: true } as Record<string, unknown>,
    });

    // Find any APPLIED referral for this user
    const referral = (await prisma.referral.findFirst({
      where: { referred_id: userId, status: 'APPLIED' as ReferralStatus },
    })) as DbReferral | null;

    if (!referral) {
      logger.info('No pending referral found for user on first paid purchase', { userId });
      return null;
    }

    // Complete the referral and credit redeemable days to referrer
    const updated = (await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: ReferralStatus.COMPLETED,
        reward_amount: new Prisma.Decimal(REFERRAL_REWARD_AMOUNT),
        reward_credited: true,
        redeemable_days: { increment: REFERRAL_REWARD_DAYS },
      } as Record<string, unknown>,
    })) as DbReferral;

    logger.info('Referral completed, reward credited to referrer', {
      referralId: referral.id,
      referrerId: referral.referrer_id,
      rewardDays: REFERRAL_REWARD_DAYS,
    });
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // Redeem accumulated reward days → extend referrer's subscription.
  // ─────────────────────────────────────────────────────────────
  async redeemRewards(userId: string) {
    const referrals = (await prisma.referral.findMany({
      where: {
        referrer_id: userId,
        status: { in: [ReferralStatus.COMPLETED, ReferralStatus.REWARDED] },
      },
    })) as DbReferral[];

    const totalRedeemableDays = referrals.reduce(
      (sum, r) => sum + (r.redeemable_days - r.redeemed_days),
      0,
    );

    if (totalRedeemableDays <= 0) {
      throw new BadRequestError('No redeemable rewards available.');
    }

    // Resolve the subscription the way subscription-service does: across all
    // businesses the user OWNS. The old findFirst picked an arbitrary
    // membership — for multi-business users it either missed the subscription
    // entirely ("No active subscription found") or extended a business the
    // user was only staff in.
    const ownedMemberships = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true, role: 'OWNER' },
      select: { business_id: true },
    });
    const ownedBusinessIds = ownedMemberships.map(m => m.business_id);
    const subscription = ownedBusinessIds.length
      ? await prisma.subscription.findFirst({
          where: {
            business_id: { in: ownedBusinessIds },
            status: { in: ['ACTIVE', 'TRIAL'] },
          },
          orderBy: { current_period_end: 'desc' },
        })
      : null;

    if (!subscription) {
      throw new BadRequestError('No active subscription found to extend.');
    }
    // Extend from NOW when the period already lapsed — extending a stale end
    // date burned the reward while leaving the account expired ("extended to"
    // a date in the past).
    const base = new Date(Math.max(Date.now(), new Date(subscription.current_period_end).getTime()));
    const newEnd = new Date(base);
    newEnd.setDate(newEnd.getDate() + totalRedeemableDays);

    // One transaction: days must never be consumed without the matching
    // extension landing (and vice versa).
    await prisma.$transaction(async tx => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { current_period_end: newEnd, status: 'ACTIVE' },
      });
      for (const r of referrals) {
        const unredeemedDays = r.redeemable_days - r.redeemed_days;
        if (unredeemedDays > 0) {
          await tx.referral.update({
            where: { id: r.id },
            data: {
              redeemed_days: r.redeemable_days,
              redeemed_at: new Date(),
            } as Record<string, unknown>,
          });
        }
      }
    });

    logger.info('Referral rewards redeemed', { userId, totalRedeemableDays, newEnd });
    return { daysRedeemed: totalRedeemableDays, newExpiryDate: newEnd };
  }

  // ─────────────────────────────────────────────────────────────
  // Get all referral data for the current user (dashboard)
  // ─────────────────────────────────────────────────────────────
  async getUserReferrals(userId: string) {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
    if (!user) throw new NotFoundError('User');

    const isEligible = await isUserEligible(userId);

    if (!isEligible) {
      return {
        isEligible: false,
        referralCode: null,
        totalReferrals: 0,
        successfulReferrals: 0,
        pendingReferrals: 0,
        totalRewardAmount: 0,
        redeemableDays: 0,
        referrals: [],
      };
    }

    // Get or create a referral code for eligible users
    let activeCode = (await prisma.referral.findFirst({
      where: { referrer_id: userId, referred_id: null },
    })) as DbReferral | null;

    if (!activeCode) {
      activeCode = (await prisma.referral.create({
        data: {
          id: uuidv4(),
          referrer_id: userId,
          referral_code: generateReferralCode(),
          status: ReferralStatus.PENDING,
        },
      })) as DbReferral;
    }

    const referrals = (await prisma.referral.findMany({
      where: { referrer_id: userId, referred_id: { not: null } },
      include: {
        referred: { select: { id: true, name: true, phone: true, created_at: true } },
      },
      orderBy: { created_at: 'desc' },
    })) as DbReferralWithReferred[];

    const successfulReferrals = referrals.filter(
      r => r.status === 'COMPLETED' || r.status === 'REWARDED',
    );
    const pendingReferrals = referrals.filter(
      r => r.status === 'APPLIED' || r.status === 'PENDING',
    );
    const totalRewardAmount = successfulReferrals.reduce((sum, r) => sum + Number(r.reward_amount), 0);
    const redeemableDays = referrals.reduce((sum, r) => sum + (r.redeemable_days - r.redeemed_days), 0);

    return {
      isEligible: true,
      referralCode: activeCode.referral_code,
      totalReferrals: referrals.length,
      successfulReferrals: successfulReferrals.length,
      pendingReferrals: pendingReferrals.length,
      totalRewardAmount,
      redeemableDays,
      referrals: referrals.map(r => ({
        id: r.id,
        referred_name: r.referred?.name || 'Unknown',
        referred_phone: r.referred?.phone
          ? r.referred.phone.replace(/(\d{3})(\d+)(\d{2})/, '$1****$3')
          : '—',
        status: r.status,
        reward_amount: Number(r.reward_amount),
        redeemable_days: r.redeemable_days,
        redeemed_days: r.redeemed_days,
        created_at: r.created_at.toISOString(),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Check whether the current user can apply a referral code
  // (for frontend gate on the subscription/purchase page)
  // ─────────────────────────────────────────────────────────────
  async getReferralEligibility(userId: string) {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as DbUser | null;
    if (!user) throw new NotFoundError('User');

    const hasPaidPlan = await isUserEligible(userId);
    const appliedReferral = await prisma.referral.findFirst({ where: { referred_id: userId } });

    return {
      canApplyReferral: !hasPaidPlan && !appliedReferral,
      hasPaidPlan,
      alreadyAppliedCode: !!appliedReferral,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Leaderboard
  // ─────────────────────────────────────────────────────────────
  async getReferralLeaderboard(currentUserId?: string) {
    const leaderboard = await prisma.$queryRaw<Array<{
      referrer_id: string; name: string; count: number; total_rewards: number;
    }>>`
      SELECT r.referrer_id, u.name,
        COUNT(r.id)::int as count,
        COALESCE(SUM(CASE WHEN r.reward_credited THEN r.reward_amount ELSE 0 END), 0)::float as total_rewards
      FROM referrals r
      JOIN users u ON r.referrer_id = u.id
      WHERE r.referred_id IS NOT NULL
        AND r.status IN ('COMPLETED', 'REWARDED')
      GROUP BY r.referrer_id, u.name
      ORDER BY count DESC
      LIMIT 20
    `;

    // Shape the page actually renders ({rank, name, referrals, earnings}) —
    // the raw aliases made every row "#undefined / undefined referrals / ₹0".
    // Other users' names are partially masked; no phone number leaves the API.
    const maskName = (name: string | null) => {
      const n = (name || '').trim();
      if (n.length <= 2) return n || 'User';
      const parts = n.split(/\s+/);
      return parts
        .map(p => (p.length <= 2 ? p : `${p.slice(0, 2)}${'*'.repeat(Math.min(p.length - 2, 6))}`))
        .join(' ');
    };
    return leaderboard.map((r, i) => ({
      rank: i + 1,
      name: currentUserId && r.referrer_id === currentUserId ? 'You' : maskName(r.name),
      referrals: r.count,
      earnings: r.total_rewards,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Admin: manually credit reward
  // ─────────────────────────────────────────────────────────────
  async creditReward(referralId: string) {
    const referral = (await prisma.referral.findUnique({
      where: { id: referralId },
    })) as DbReferral | null;
    if (!referral) throw new NotFoundError('Referral');
    if (referral.reward_credited) throw new BadRequestError('Reward already credited');

    const updated = (await prisma.referral.update({
      where: { id: referralId },
      data: {
        reward_credited: true,
        status: ReferralStatus.REWARDED,
        redeemable_days: { increment: REFERRAL_REWARD_DAYS },
      } as Record<string, unknown>,
    })) as DbReferral;

    logger.info('Admin: Referral reward manually credited', {
      referralId, referrerId: referral.referrer_id,
    });
    return updated;
  }

  // Legacy alias — kept for backward compatibility
  async createReferralCode(userId: string) {
    return this.getOrCreateReferralCode(userId);
  }
}

export const referralService = new ReferralService();
