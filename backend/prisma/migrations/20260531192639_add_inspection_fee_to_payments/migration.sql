-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "inspectionFeeEur" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "inspectionFeeEur" INTEGER;

-- AlterTable
ALTER TABLE "SaleHistory" ADD COLUMN     "inspectionFeeEur" INTEGER;
