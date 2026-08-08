-- Add is_paid to purchase_expenses (default TRUE = already paid / settled in purchase total)
ALTER TABLE "purchase_expenses" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT true;

-- Add is_paid to cutter_transactions (default TRUE = already paid)
ALTER TABLE "cutter_transactions" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT true;

-- Add optional receipt_url to purchase_expenses
ALTER TABLE "purchase_expenses" ADD COLUMN IF NOT EXISTS "receipt_url" TEXT;

-- Add optional receipt_url to cutter_transactions
ALTER TABLE "cutter_transactions" ADD COLUMN IF NOT EXISTS "receipt_url" TEXT;
