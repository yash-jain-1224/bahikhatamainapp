-- AlterEnum
ALTER TYPE "ReferralStatus" ADD VALUE 'APPLIED';

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "redeemable_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redeemed_at" TIMESTAMP(3),
ADD COLUMN     "redeemed_days" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "has_paid_plan" BOOLEAN NOT NULL DEFAULT false;
