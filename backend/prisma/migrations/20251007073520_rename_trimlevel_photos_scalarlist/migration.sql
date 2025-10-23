/*
  Warnings:

  - You are about to drop the column `trim` on the `Car` table. All the data in the column will be lost.
  - The `photos` column on the `Car` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Car" DROP COLUMN "trim",
ADD COLUMN     "trimLevel" TEXT,
DROP COLUMN "photos",
ADD COLUMN     "photos" TEXT[];
