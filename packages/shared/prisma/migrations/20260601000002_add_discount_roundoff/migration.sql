-- Add discount and round_off to purchases
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "discount"   NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "round_off"  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Add round_off to sales (discount already exists)
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "round_off" NUMERIC(15,2) NOT NULL DEFAULT 0;
