/*
  Warnings:

  - You are about to drop the column `carId` on the `Chat` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[inspectionRequestId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_offerId_fkey";

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "carId",
ADD COLUMN     "inspectionRequestId" INTEGER,
ALTER COLUMN "offerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Chat_buyerId_createdAt_idx" ON "Chat"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Chat_sellerId_createdAt_idx" ON "Chat"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_inspectionRequestId_key" ON "Chat"("inspectionRequestId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_inspectionRequestId_fkey" FOREIGN KEY ("inspectionRequestId") REFERENCES "InspectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
