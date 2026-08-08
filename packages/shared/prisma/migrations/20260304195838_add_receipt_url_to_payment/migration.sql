-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payment_purchase_fk";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payment_sale_fk";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receipt_url" TEXT;
