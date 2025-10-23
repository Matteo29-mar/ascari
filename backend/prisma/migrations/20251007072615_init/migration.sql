-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "doors" INTEGER,
ADD COLUMN     "drivetrain" TEXT,
ADD COLUMN     "engine" TEXT,
ADD COLUMN     "fuelType" TEXT,
ADD COLUMN     "horsepower" INTEGER,
ADD COLUMN     "photos" JSONB,
ADD COLUMN     "priceEur" INTEGER,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "torqueNm" INTEGER,
ADD COLUMN     "transmission" TEXT,
ADD COLUMN     "trim" TEXT;
