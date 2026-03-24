-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'SEEN', 'CONFIRMED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('PERFECT', 'PARTIAL');

-- CreateTable
CREATE TABLE "InspectorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workshopName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusKm" INTEGER NOT NULL DEFAULT 70,
    "workStartMin" INTEGER NOT NULL DEFAULT 540,
    "workEndMin" INTEGER NOT NULL DEFAULT 1080,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectorSlot" (
    "id" SERIAL NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectorSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRequest" (
    "id" SERIAL NOT NULL,
    "carId" INTEGER NOT NULL,
    "sellerId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "matchType" "MatchType" NOT NULL DEFAULT 'PERFECT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectorProfile_userId_key" ON "InspectorProfile"("userId");

-- CreateIndex
CREATE INDEX "InspectorProfile_latitude_longitude_idx" ON "InspectorProfile"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "InspectorProfile_radiusKm_idx" ON "InspectorProfile"("radiusKm");

-- CreateIndex
CREATE INDEX "InspectorSlot_inspectorId_startAt_idx" ON "InspectorSlot"("inspectorId", "startAt");

-- CreateIndex
CREATE INDEX "InspectorSlot_inspectorId_endAt_idx" ON "InspectorSlot"("inspectorId", "endAt");

-- CreateIndex
CREATE INDEX "InspectionRequest_inspectorId_requestedAt_idx" ON "InspectionRequest"("inspectorId", "requestedAt");

-- CreateIndex
CREATE INDEX "InspectionRequest_sellerId_createdAt_idx" ON "InspectionRequest"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "InspectionRequest_carId_idx" ON "InspectionRequest"("carId");

-- AddForeignKey
ALTER TABLE "InspectorProfile" ADD CONSTRAINT "InspectorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectorSlot" ADD CONSTRAINT "InspectorSlot_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "InspectorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "InspectorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
