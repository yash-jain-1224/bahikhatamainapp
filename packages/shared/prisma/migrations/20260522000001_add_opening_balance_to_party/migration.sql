-- AlterTable: add opening_balance to parties
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0;
