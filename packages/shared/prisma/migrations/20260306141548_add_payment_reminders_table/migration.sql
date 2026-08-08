-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "remind_on" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2),
    "note" TEXT,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_business_id_idx" ON "payment_reminders"("business_id");

-- CreateIndex
CREATE INDEX "payment_reminders_reference_type_reference_id_idx" ON "payment_reminders"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "payment_reminders_business_id_remind_on_idx" ON "payment_reminders"("business_id", "remind_on");

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
