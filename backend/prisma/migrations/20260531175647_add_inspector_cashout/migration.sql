-- CreateEnum
CREATE TYPE "CashoutStatus" AS ENUM ('REQUESTED', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InspectorCashout" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "inspectorUserId" TEXT NOT NULL,
    "amountEur" INTEGER NOT NULL DEFAULT 120,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "CashoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "stripeTransferId" TEXT,
    "stripeAccountId" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectorCashout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectorCashout_reportId_key" ON "InspectorCashout"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectorCashout_stripeTransferId_key" ON "InspectorCashout"("stripeTransferId");

-- CreateIndex
CREATE INDEX "InspectorCashout_inspectorUserId_createdAt_idx" ON "InspectorCashout"("inspectorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "InspectorCashout_status_idx" ON "InspectorCashout"("status");

-- AddForeignKey
ALTER TABLE "InspectorCashout" ADD CONSTRAINT "InspectorCashout_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectorCashout" ADD CONSTRAINT "InspectorCashout_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
