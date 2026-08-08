-- Brings the migration chain back in line with schema.prisma.
--
-- schema.prisma declared 46 models but the chain only ever created 40, so a
-- fresh `prisma migrate deploy` produced a database where
-- business_credit_cards and the five whatsapp_ai_* tables did not exist. The
-- business-service credit-card endpoints failed at runtime with
-- "Invalid prisma.businessCreditCard.findMany() invocation".
--
-- PaymentMode was likewise missing the CARD value that schema.prisma declares
-- and that the UI offers in seven places.
--
-- Purely additive: 6 CREATE TABLE, 20 CREATE INDEX, 4 FKs, 1 enum value.

-- AlterEnum
--
-- IF NOT EXISTS is required, not defensive padding: the deployed Azure database
-- was built with `db push` from a newer schema.prisma than the migration chain
-- reflected, so it already carries 'CARD' while never having recorded a single
-- migration. Baselining that database and then deploying this migration would
-- abort here on a duplicate enum value. Adding an enum value inside a
-- transaction is fine on PG 12+ as long as the value is not used in the same
-- transaction, which it is not.
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'CARD';

-- CreateTable
CREATE TABLE "business_credit_cards" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "card_name" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "card_network" TEXT NOT NULL DEFAULT 'VISA',
    "bank_name" TEXT NOT NULL,
    "card_holder" TEXT,
    "billing_date" INTEGER,
    "due_date" INTEGER,
    "credit_limit" DECIMAL(15,2),
    "current_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "user_name" TEXT,
    "language" TEXT NOT NULL DEFAULT 'hinglish',
    "current_intent" TEXT,
    "session_data" JSONB,
    "preferences" JSONB,
    "entity_mappings" JSONB,
    "learning_data" JSONB,
    "last_message_at" TIMESTAMP(3),
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "wa_message_id" TEXT,
    "direction" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "content" TEXT,
    "media_url" TEXT,
    "media_type" TEXT,
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "entities" JSONB,
    "processing_time" INTEGER,
    "agent_path" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_ai_transactions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bill_number" TEXT,
    "payment_mode" TEXT,
    "reference" TEXT,
    "items" JSONB,
    "gst_data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "posted_entry_id" TEXT,
    "source_message_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_ai_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_ai_approvals" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "approval_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_ai_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_ai_documents" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "document_type" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT,
    "ocr_text" TEXT,
    "extracted_data" JSONB,
    "confidence" DOUBLE PRECISION,
    "processing_time" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_ai_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_credit_cards_business_id_idx" ON "business_credit_cards"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_business_id_idx" ON "whatsapp_conversations"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_phone_idx" ON "whatsapp_conversations"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_business_id_phone_key" ON "whatsapp_conversations"("business_id", "phone");

-- CreateIndex
CREATE INDEX "whatsapp_ai_messages_conversation_id_idx" ON "whatsapp_ai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_messages_wa_message_id_idx" ON "whatsapp_ai_messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_messages_created_at_idx" ON "whatsapp_ai_messages"("created_at");

-- CreateIndex
CREATE INDEX "whatsapp_ai_transactions_conversation_id_idx" ON "whatsapp_ai_transactions"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_transactions_business_id_idx" ON "whatsapp_ai_transactions"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_transactions_status_idx" ON "whatsapp_ai_transactions"("status");

-- CreateIndex
CREATE INDEX "whatsapp_ai_transactions_created_at_idx" ON "whatsapp_ai_transactions"("created_at");

-- CreateIndex
CREATE INDEX "whatsapp_ai_approvals_conversation_id_idx" ON "whatsapp_ai_approvals"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_approvals_business_id_idx" ON "whatsapp_ai_approvals"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_approvals_status_idx" ON "whatsapp_ai_approvals"("status");

-- CreateIndex
CREATE INDEX "whatsapp_ai_approvals_expires_at_idx" ON "whatsapp_ai_approvals"("expires_at");

-- CreateIndex
CREATE INDEX "whatsapp_ai_documents_business_id_idx" ON "whatsapp_ai_documents"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_documents_conversation_id_idx" ON "whatsapp_ai_documents"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_ai_documents_document_type_idx" ON "whatsapp_ai_documents"("document_type");

-- CreateIndex
--
-- These last two indexes are the only statements in this migration that touch
-- pre-existing tables, so they are the only ones that can collide: the 19
-- above index tables this migration itself creates. Both are declared in
-- schema.prisma but were never emitted by the earlier migrations, so a
-- migrate-deploy database lacks them while the db push-built Azure database
-- already has them. IF NOT EXISTS is what lets one migration serve both.
CREATE INDEX IF NOT EXISTS "cutters_party_id_idx" ON "cutters"("party_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_party_id_reference_type_idx" ON "ledger_entries"("business_id", "party_id", "reference_type");

-- AddForeignKey
ALTER TABLE "business_credit_cards" ADD CONSTRAINT "business_credit_cards_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_ai_messages" ADD CONSTRAINT "whatsapp_ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_ai_transactions" ADD CONSTRAINT "whatsapp_ai_transactions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_ai_approvals" ADD CONSTRAINT "whatsapp_ai_approvals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

