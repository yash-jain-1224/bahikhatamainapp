-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BILL_REMINDER';

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "reminder_amount" DECIMAL(15,2),
ADD COLUMN     "reminder_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "reminder_amount" DECIMAL(15,2),
ADD COLUMN     "reminder_date" TIMESTAMP(3);
