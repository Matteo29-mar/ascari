-- ARVE 2.0: base prezzi Excel + dataset osservazioni reali ASCARI
CREATE TYPE "ArveMarketDataQuality" AS ENUM ('VERIFIED', 'AGGREGATED', 'MODEL_ESTIMATE', 'TO_VALIDATE');
CREATE TYPE "ArveMarketObservationType" AS ENUM ('LISTING_CREATED', 'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'REAL_SALE');

CREATE TABLE "ArveMarketReference" (
    "id" SERIAL NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trimLevel" TEXT,
    "fuelType" TEXT NOT NULL,
    "makeNormalized" TEXT NOT NULL,
    "modelNormalized" TEXT NOT NULL,
    "fuelNormalized" TEXT NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "kmMin" INTEGER,
    "kmMax" INTEGER,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "quality" "ArveMarketDataQuality" NOT NULL,
    "qualityNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ASCARI_ARVE_XLSX',
    "sourceVersion" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArveMarketReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArveMarketReference_vehicle_year_source_key"
ON "ArveMarketReference"("makeNormalized", "modelNormalized", "fuelNormalized", "referenceYear", "source");
CREATE INDEX "ArveMarketReference_vehicle_idx"
ON "ArveMarketReference"("makeNormalized", "modelNormalized", "fuelNormalized");
CREATE INDEX "ArveMarketReference_referenceYear_idx" ON "ArveMarketReference"("referenceYear");
CREATE INDEX "ArveMarketReference_quality_idx" ON "ArveMarketReference"("quality");
CREATE INDEX "ArveMarketReference_sourceVersion_idx" ON "ArveMarketReference"("sourceVersion");

CREATE TABLE "ArveMarketObservation" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER,
    "type" "ArveMarketObservationType" NOT NULL,
    "externalKey" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mileageKm" INTEGER,
    "fuelType" TEXT NOT NULL,
    "transmission" TEXT,
    "trimLevel" TEXT,
    "amountEur" INTEGER,
    "offerPrice1" INTEGER,
    "offerPrice2" INTEGER,
    "offerPrice3" INTEGER,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArveMarketObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArveMarketObservation_externalKey_key" ON "ArveMarketObservation"("externalKey");
CREATE INDEX "ArveMarketObservation_make_model_year_idx" ON "ArveMarketObservation"("make", "model", "year");
CREATE INDEX "ArveMarketObservation_type_occurredAt_idx" ON "ArveMarketObservation"("type", "occurredAt");
CREATE INDEX "ArveMarketObservation_carId_occurredAt_idx" ON "ArveMarketObservation"("carId", "occurredAt");
ALTER TABLE "ArveMarketObservation"
ADD CONSTRAINT "ArveMarketObservation_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArvePricingAnalysis"
ADD COLUMN "marketReferenceMatchesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "marketReferenceQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "marketReferenceMedian" INTEGER,
ADD COLUMN "marketReferenceItems" JSONB;
