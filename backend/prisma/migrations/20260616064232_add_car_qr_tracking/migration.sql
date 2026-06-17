/*
  Warnings:

  - A unique constraint covering the columns `[qrToken]` on the table `Car` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "qrCodeCreatedAt" TIMESTAMP(3),
ADD COLUMN     "qrToken" TEXT;

-- CreateTable
CREATE TABLE "QrScan" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrScan_carId_scannedAt_idx" ON "QrScan"("carId", "scannedAt");

-- CreateIndex
CREATE INDEX "QrScan_carId_visitorHash_idx" ON "QrScan"("carId", "visitorHash");

-- CreateIndex
CREATE UNIQUE INDEX "Car_qrToken_key" ON "Car"("qrToken");

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
