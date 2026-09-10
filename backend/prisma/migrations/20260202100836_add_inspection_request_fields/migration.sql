/*
  FIX migration InspectionRequest con backfill dati esistenti
*/

-- 1️⃣ aggiungiamo le colonne come NULLABLE
ALTER TABLE "InspectionRequest"
ADD COLUMN "requestedDate" TEXT,
ADD COLUMN "requestedStartMin" INTEGER,
ADD COLUMN "requestedEndMin" INTEGER;

-- 2️⃣ backfill dei record ESISTENTI
-- usiamo createdAt come fallback sensato
UPDATE "InspectionRequest"
SET
  "requestedDate" = to_char("createdAt", 'YYYY-MM-DD'),
  "requestedStartMin" = 540, -- 09:00
  "requestedEndMin" = 600   -- 10:00
WHERE "requestedDate" IS NULL;

-- 3️⃣ rendiamo le colonne NOT NULL
ALTER TABLE "InspectionRequest"
ALTER COLUMN "requestedDate" SET NOT NULL,
ALTER COLUMN "requestedStartMin" SET NOT NULL,
ALTER COLUMN "requestedEndMin" SET NOT NULL;

-- 4️⃣ indice
CREATE INDEX "InspectionRequest_requestedDate_idx"
ON "InspectionRequest"("requestedDate");
