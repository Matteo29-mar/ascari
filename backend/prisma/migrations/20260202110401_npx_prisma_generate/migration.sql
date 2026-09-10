/*
  Warnings:

  - You are about to drop the column `requestedAt` on the `InspectionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `requestedDate` on the `InspectionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `requestedEndMin` on the `InspectionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `requestedStartMin` on the `InspectionRequest` table. All the data in the column will be lost.
  - Added the required column `endAt` to the `InspectionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inspectorSlotId` to the `InspectionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startAt` to the `InspectionRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "InspectionStatus" ADD VALUE 'ASSIGNED';

-- DropIndex
DROP INDEX "InspectionRequest_inspectorId_requestedAt_idx";

-- DropIndex
DROP INDEX "InspectionRequest_requestedDate_idx";

-- AlterTable
ALTER TABLE "InspectionRequest" DROP COLUMN "requestedAt",
DROP COLUMN "requestedDate",
DROP COLUMN "requestedEndMin",
DROP COLUMN "requestedStartMin",
ADD COLUMN     "endAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "inspectorSlotId" INTEGER NOT NULL,
ADD COLUMN     "startAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "InspectionRequest_inspectorId_startAt_idx" ON "InspectionRequest"("inspectorId", "startAt");

-- CreateIndex
CREATE INDEX "InspectionRequest_inspectorSlotId_idx" ON "InspectionRequest"("inspectorSlotId");

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_inspectorSlotId_fkey" FOREIGN KEY ("inspectorSlotId") REFERENCES "InspectorSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
