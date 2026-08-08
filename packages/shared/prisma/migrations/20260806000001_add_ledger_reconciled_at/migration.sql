-- Reconciliation marker for bank / credit-card statement matching.
--
-- Both reconcile endpoints previously "acknowledged" a match with
-- `data: { narration: undefined }`, which updates no column whatsoever. The UI
-- reported matches, incremented a counter and showed an "All entries
-- reconciled!" banner while nothing was persisted — every match vanished on
-- reload, and with no marker there was nothing to dedupe against, so
-- re-uploading a statement and clicking Create duplicated every ledger entry.
--
-- Nullable with no default: existing rows are simply unreconciled, which is
-- exactly what they were. Idempotent so it is safe on a `db push`-built
-- database as well as a migrated one.
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMP(3);

-- Supports "show me what is still unreconciled for this business".
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_reconciled_at_idx"
  ON "ledger_entries"("business_id", "reconciled_at");
