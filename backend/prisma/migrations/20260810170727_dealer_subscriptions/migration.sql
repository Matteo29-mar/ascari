-- CreateEnum
CREATE TYPE "DealerPlan" AS ENUM ('FREE', 'TOP', 'PREMIUM');

-- CreateEnum
CREATE TYPE "DealerSubscriptionStatus" AS ENUM ('FREE', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED', 'PAUSED');

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "dealerPlanSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dealerPlanSuspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DealerSubscription" (
    "id" TEXT NOT NULL,
    "dealerProfileId" TEXT NOT NULL,
    "plan" "DealerPlan" NOT NULL DEFAULT 'FREE',
    "status" "DealerSubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerSubscription_dealerProfileId_key" ON "DealerSubscription"("dealerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerSubscription_stripeCustomerId_key" ON "DealerSubscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerSubscription_stripeSubscriptionId_key" ON "DealerSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "DealerSubscription_plan_status_idx" ON "DealerSubscription"("plan", "status");

-- CreateIndex
CREATE INDEX "DealerSubscription_stripePriceId_idx" ON "DealerSubscription"("stripePriceId");

-- AddForeignKey
ALTER TABLE "DealerSubscription" ADD CONSTRAINT "DealerSubscription_dealerProfileId_fkey" FOREIGN KEY ("dealerProfileId") REFERENCES "DealerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
