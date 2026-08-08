# Referral System — Migration Guide

## Schema Changes

Two sets of changes were made to `packages/shared/prisma/schema.prisma`:

### 1. `User` model
A new boolean field was added:
```prisma
has_paid_plan  Boolean  @default(false)  // true after first successful paid purchase
```

### 2. `Referral` model
Three new fields were added for reward tracking:
```prisma
redeemable_days  Int       @default(0)  // days of subscription extension earned
redeemed_days    Int       @default(0)  // days already redeemed
redeemed_at      DateTime?              // last redemption timestamp
```

### 3. `ReferralStatus` enum
New `APPLIED` status added (code applied by referred user, awaiting first paid purchase):
```prisma
enum ReferralStatus {
  PENDING    // Code created, not yet used
  APPLIED    // Code applied by referred user, awaiting first paid purchase
  COMPLETED  // Referred user made first paid purchase — reward earned
  EXPIRED
  REWARDED   // Reward credited (legacy / admin action)
}
```

## Running the Migration

```bash
cd packages/shared

# Create and apply migration
npx prisma migrate dev --name add_referral_rewards_and_paid_flag

# Regenerate the Prisma client (removes the `as any` bridge casts)
npx prisma generate

# Rebuild services that depend on the shared package
cd ../../
npm run build --workspace=packages/referral-service
npm run build --workspace=packages/subscription-service
```

## New API Endpoints (Referral Service)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/referrals/eligibility` | Check if user can apply a referral code |
| `POST` | `/referrals/redeem` | Redeem accumulated reward days → extend subscription |
| `POST` | `/referrals/first-paid-purchase` | (Internal) Trigger reward after first paid purchase |

## Business Rules Enforced

1. **Referral dashboard visibility** — Sidebar nav only appears for users with `has_paid_plan = true` or `totalReferrals > 0`
2. **Referral code entry** — Only shown on the Subscription page, only when `canApplyReferral = true` (not yet purchased a paid plan, and no code already applied)
3. **One-time code usage** — Enforced both at DB level (unique referral record) and service layer
4. **Free trial restriction** — `has_paid_plan` must be `false` to apply a code; only paid plan holders can generate referral codes
5. **Optional entry** — The referral code field is clearly marked optional and skippable
6. **First paid purchase only** — Code status stays `APPLIED` until `handleFirstPaidPurchase` fires on payment confirmation
7. **Reward tracking** — Dashboard shows total/successful/pending referrals and redeemable days
8. **Redemption** — Clicking "Redeem" extends `current_period_end` on the active subscription by the earned days
