-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "reminder_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "reminder_notified_at" TIMESTAMP(3);
