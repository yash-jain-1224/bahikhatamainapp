-- AlterTable
ALTER TABLE "cutters" ALTER COLUMN "rate_per_unit" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "is_mine" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "gst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gst_mode" TEXT,
ADD COLUMN     "gst_value" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "gst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gst_mode" TEXT,
ADD COLUMN     "gst_value" DECIMAL(15,2);
