/*
  Warnings:

  - Made the column `transmission` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fuelType` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `offerPrice1` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `offerPrice2` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `offerPrice3` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `city` on table `Car` required. This step will fail if there are existing NULL values in that column.
  - Made the column `locationText` on table `Car` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Car" ALTER COLUMN "transmission" SET NOT NULL,
ALTER COLUMN "fuelType" SET NOT NULL,
ALTER COLUMN "offerPrice1" SET NOT NULL,
ALTER COLUMN "offerPrice2" SET NOT NULL,
ALTER COLUMN "offerPrice3" SET NOT NULL,
ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "locationText" SET NOT NULL;

-- CreateTable
CREATE TABLE "SaleHistory" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "paymentId" INTEGER,
    "amountEur" INTEGER NOT NULL,
    "ascariFeeEur" INTEGER,
    "sellerNetEur" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "carSnapshot" JSONB NOT NULL,
    "inspectionSnapshot" JSONB,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleHistory_paymentId_key" ON "SaleHistory"("paymentId");

-- CreateIndex
CREATE INDEX "SaleHistory_buyerId_soldAt_idx" ON "SaleHistory"("buyerId", "soldAt");

-- CreateIndex
CREATE INDEX "SaleHistory_sellerId_soldAt_idx" ON "SaleHistory"("sellerId", "soldAt");

-- CreateIndex
CREATE INDEX "SaleHistory_carId_idx" ON "SaleHistory"("carId");

-- AddForeignKey
ALTER TABLE "SaleHistory" ADD CONSTRAINT "SaleHistory_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleHistory" ADD CONSTRAINT "SaleHistory_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleHistory" ADD CONSTRAINT "SaleHistory_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
