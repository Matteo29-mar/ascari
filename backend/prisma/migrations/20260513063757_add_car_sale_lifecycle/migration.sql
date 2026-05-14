-- CreateEnum
CREATE TYPE "CarMarketStatus" AS ENUM ('AVAILABLE', 'SOLD_PENDING_REMOVAL', 'REMOVED_AFTER_SALE');

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "marketStatus" "CarMarketStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "removalScheduledAt" TIMESTAMP(3),
ADD COLUMN     "soldAt" TIMESTAMP(3),
ADD COLUMN     "soldByPaymentId" INTEGER,
ADD COLUMN     "soldBySaleHistoryId" INTEGER,
ADD COLUMN     "visuallyRemovedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Car_marketStatus_idx" ON "Car"("marketStatus");

-- CreateIndex
CREATE INDEX "Car_removalScheduledAt_idx" ON "Car"("removalScheduledAt");

-- CreateIndex
CREATE INDEX "Car_visuallyRemovedAt_idx" ON "Car"("visuallyRemovedAt");
