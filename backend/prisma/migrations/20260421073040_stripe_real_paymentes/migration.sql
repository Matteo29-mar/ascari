-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "stripeClientSecret" TEXT,
    "stripeChargeId" TEXT,
    "stripeTransferId" TEXT,
    "stripeApplicationFeeId" TEXT,
    "amountEur" INTEGER NOT NULL,
    "ascariFeeEur" INTEGER NOT NULL,
    "sellerNetEur" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_carId_createdAt_idx" ON "Payment"("carId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_buyerId_createdAt_idx" ON "Payment"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_sellerId_createdAt_idx" ON "Payment"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
