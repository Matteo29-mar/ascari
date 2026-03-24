-- CreateTable
CREATE TABLE "InspectionReport" (
    "id" SERIAL NOT NULL,
    "inspectionRequestId" INTEGER NOT NULL,
    "inspectorUserId" TEXT NOT NULL,
    "carId" INTEGER NOT NULL,
    "title" TEXT,
    "overallStatus" TEXT,
    "plate" TEXT,
    "vin" TEXT,
    "km" INTEGER,
    "inspectionDate" TIMESTAMP(3),
    "location" TEXT,
    "bodyworkNotes" TEXT,
    "interiorNotes" TEXT,
    "engineNotes" TEXT,
    "mechanicsNotes" TEXT,
    "tiresNotes" TEXT,
    "electronicsNotes" TEXT,
    "testDriveNotes" TEXT,
    "defectsFound" TEXT,
    "finalOpinion" TEXT,
    "estimatedValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_inspectionRequestId_key" ON "InspectionReport"("inspectionRequestId");

-- CreateIndex
CREATE INDEX "InspectionReport_inspectorUserId_createdAt_idx" ON "InspectionReport"("inspectorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "InspectionReport_carId_idx" ON "InspectionReport"("carId");

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_inspectionRequestId_fkey" FOREIGN KEY ("inspectionRequestId") REFERENCES "InspectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
