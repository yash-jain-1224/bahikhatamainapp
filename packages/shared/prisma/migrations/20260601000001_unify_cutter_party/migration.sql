-- Add CUTTER to PartyType enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CUTTER'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartyType')
  ) THEN
    ALTER TYPE "PartyType" ADD VALUE 'CUTTER';
  END IF;
END$$;

-- Add party_id link to cutters
ALTER TABLE "cutters" ADD COLUMN IF NOT EXISTS "party_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "cutters_party_id_key" ON "cutters"("party_id");

-- FK to parties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cutters_party_id_fkey'
  ) THEN
    ALTER TABLE "cutters" ADD CONSTRAINT "cutters_party_id_fkey"
      FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
