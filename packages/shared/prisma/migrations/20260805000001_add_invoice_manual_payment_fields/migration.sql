-- Manual/offline payment reconciliation fields on invoices.
--
-- The admin console's "Manual Subscription Purchase" collects a payment mode,
-- a reference/receipt number and free-text notes. The service signature
-- accepted all three and then never wrote them anywhere, so the feature that
-- exists specifically to record how cash was collected recorded nothing.
--
-- All three are nullable with no default: every existing invoice row stays
-- valid and untouched, and the statements are idempotent so this is safe to
-- apply to a database that was built with `db push` as well as a migrated one.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_mode" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
