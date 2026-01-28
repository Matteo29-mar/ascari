-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "isPeriziata" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periziaDocUrl" TEXT,
ADD COLUMN     "periziaUploadedAt" TIMESTAMP(3);
