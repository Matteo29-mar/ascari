-- ASCARI 2026-08-20
-- Nuovi piani concessionaria, dispositivi, recensioni e perizia visuale.

-- DealerPlan: FREE/TOP/PREMIUM -> STARTER/ADVANCED.
CREATE TYPE "DealerPlan_new" AS ENUM ('STARTER', 'ADVANCED');
ALTER TABLE "DealerSubscription" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "DealerSubscription"
  ALTER COLUMN "plan" TYPE "DealerPlan_new"
  USING (
    CASE
      WHEN "plan"::text = 'PREMIUM' THEN 'ADVANCED'
      ELSE 'STARTER'
    END
  )::"DealerPlan_new";
DROP TYPE "DealerPlan";
ALTER TYPE "DealerPlan_new" RENAME TO "DealerPlan";
ALTER TABLE "DealerSubscription" ALTER COLUMN "plan" SET DEFAULT 'STARTER';

-- Lo stato FREE diventa INACTIVE: una concessionaria senza abbonamento non ha accesso al piano.
CREATE TYPE "DealerSubscriptionStatus_new" AS ENUM (
  'INACTIVE',
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'UNPAID',
  'CANCELED',
  'PAUSED'
);
ALTER TABLE "DealerSubscription" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DealerSubscription"
  ALTER COLUMN "status" TYPE "DealerSubscriptionStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'FREE' THEN 'INACTIVE'
      ELSE "status"::text
    END
  )::"DealerSubscriptionStatus_new";
DROP TYPE "DealerSubscriptionStatus";
ALTER TYPE "DealerSubscriptionStatus_new" RENAME TO "DealerSubscriptionStatus";
ALTER TABLE "DealerSubscription" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

-- Tutti i record esistenti prima di questa migration appartengono ai vecchi
-- piani FREE/TOP/PREMIUM. Vengono disattivati lato ASCARI: un vecchio Price
-- Stripe non deve ottenere i nuovi entitlement mantenendo il vecchio importo.
UPDATE "DealerSubscription"
SET "status" = 'INACTIVE';

-- Le auto dei dealer senza un abbonamento attivo non devono restare pubbliche
-- dopo la migrazione, anche se il concessionario non ha ancora effettuato un nuovo accesso.
UPDATE "Car" AS car
SET
  "dealerPlanSuspended" = true,
  "dealerPlanSuspendedAt" = COALESCE(car."dealerPlanSuspendedAt", CURRENT_TIMESTAMP)
FROM "DealerProfile" AS dealer
JOIN "DealerSubscription" AS subscription
  ON subscription."dealerProfileId" = dealer."id"
WHERE dealer."userId" = car."owner_id"
  AND subscription."status" = 'INACTIVE';

CREATE TABLE "DealerDevice" (
  "id" TEXT NOT NULL,
  "dealerProfileId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "label" TEXT,
  "userAgent" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerDevice_dealerProfileId_deviceId_key"
  ON "DealerDevice"("dealerProfileId", "deviceId");
CREATE INDEX "DealerDevice_dealerProfileId_revokedAt_idx"
  ON "DealerDevice"("dealerProfileId", "revokedAt");
CREATE INDEX "DealerDevice_lastSeenAt_idx"
  ON "DealerDevice"("lastSeenAt");
ALTER TABLE "DealerDevice"
  ADD CONSTRAINT "DealerDevice_dealerProfileId_fkey"
  FOREIGN KEY ("dealerProfileId") REFERENCES "DealerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DealerReview" (
  "id" SERIAL NOT NULL,
  "dealerProfileId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerReview_dealerProfileId_authorId_key"
  ON "DealerReview"("dealerProfileId", "authorId");
CREATE INDEX "DealerReview_dealerProfileId_createdAt_idx"
  ON "DealerReview"("dealerProfileId", "createdAt");
CREATE INDEX "DealerReview_rating_idx" ON "DealerReview"("rating");
ALTER TABLE "DealerReview"
  ADD CONSTRAINT "DealerReview_dealerProfileId_fkey"
  FOREIGN KEY ("dealerProfileId") REFERENCES "DealerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerReview"
  ADD CONSTRAINT "DealerReview_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionReport" ADD COLUMN "valuationOpinion" TEXT;

CREATE TABLE "InspectionRating" (
  "id" SERIAL NOT NULL,
  "reportId" INTEGER NOT NULL,
  "pointKey" TEXT NOT NULL,
  "pointLabel" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionRating_reportId_pointKey_key"
  ON "InspectionRating"("reportId", "pointKey");
CREATE INDEX "InspectionRating_reportId_category_idx"
  ON "InspectionRating"("reportId", "category");
CREATE INDEX "InspectionRating_score_idx" ON "InspectionRating"("score");
ALTER TABLE "InspectionRating"
  ADD CONSTRAINT "InspectionRating_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
