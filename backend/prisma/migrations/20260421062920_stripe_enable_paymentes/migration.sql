/*
  Warnings:

  - A unique constraint covering the columns `[stripeAccountId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "ascariFeeEur" INTEGER,
ADD COLUMN     "paymentConfiguredAt" TIMESTAMP(3),
ADD COLUMN     "paymentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
ADD COLUMN     "salePriceEur" INTEGER,
ADD COLUMN     "sellerNetEur" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "paymentsEnabledAt" TIMESTAMP(3),
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeAccountStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeOnboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Car_paymentEnabled_idx" ON "Car"("paymentEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeAccountId_key" ON "User"("stripeAccountId");
