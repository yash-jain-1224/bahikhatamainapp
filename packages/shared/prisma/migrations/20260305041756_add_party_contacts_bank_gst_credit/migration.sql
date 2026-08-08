-- CreateEnum
CREATE TYPE "GstRegistrationType" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED', 'CONSUMER');

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "credit_limit" DECIMAL(15,2),
ADD COLUMN     "credit_period_days" INTEGER,
ADD COLUMN     "gst_registration_type" "GstRegistrationType" NOT NULL DEFAULT 'UNREGISTERED',
ADD COLUMN     "gst_state" TEXT;

-- CreateTable
CREATE TABLE "party_contacts" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_bank_accounts" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "branch" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "party_contacts_party_id_idx" ON "party_contacts"("party_id");

-- CreateIndex
CREATE INDEX "party_bank_accounts_party_id_idx" ON "party_bank_accounts"("party_id");

-- AddForeignKey
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
