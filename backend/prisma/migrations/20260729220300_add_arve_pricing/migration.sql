-- CreateTable
CREATE TABLE "ArvePricingAnalysis" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER NOT NULL,
    "originalOfferPrice1" INTEGER NOT NULL,
    "originalOfferPrice2" INTEGER NOT NULL,
    "originalOfferPrice3" INTEGER NOT NULL,
    "quickSalePrice" INTEGER NOT NULL,
    "reservePrice" INTEGER NOT NULL,
    "democraticPrice" INTEGER NOT NULL,
    "marketMin" INTEGER NOT NULL,
    "marketMax" INTEGER NOT NULL,
    "marketMedian" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceLevel" INTEGER NOT NULL,
    "comparableItems" JSONB,
    "privateMatchesCount" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL,
    "modelUsed" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "rawResponseJson" JSONB,
    "analysisError" TEXT,
    "userDecision" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedOfferPrice1" INTEGER,
    "appliedOfferPrice2" INTEGER,
    "appliedOfferPrice3" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "actualSoldPriceEur" INTEGER,
    "actualSoldAt" TIMESTAMP(3),
    "daysToSell" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArvePricingAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArvePricingAnalysis_carId_key" ON "ArvePricingAnalysis"("carId");

-- CreateIndex
CREATE INDEX "ArvePricingAnalysis_sourceType_idx" ON "ArvePricingAnalysis"("sourceType");

-- CreateIndex
CREATE INDEX "ArvePricingAnalysis_userDecision_idx" ON "ArvePricingAnalysis"("userDecision");

-- CreateIndex
CREATE INDEX "ArvePricingAnalysis_actualSoldAt_idx" ON "ArvePricingAnalysis"("actualSoldAt");

-- CreateIndex
CREATE INDEX "ArvePricingAnalysis_createdAt_idx" ON "ArvePricingAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "ArvePricingAnalysis"
ADD CONSTRAINT "ArvePricingAnalysis_carId_fkey"
FOREIGN KEY ("carId") REFERENCES "Car"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
