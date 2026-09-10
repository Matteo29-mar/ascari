/*
  Warnings:

  - The values [PARTIAL] on the enum `MatchType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MatchType_new" AS ENUM ('PERFECT', 'FLEXIBLE_TIME', 'RADIUS');
ALTER TABLE "InspectionRequest" ALTER COLUMN "matchType" DROP DEFAULT;
ALTER TABLE "InspectionRequest" ALTER COLUMN "matchType" TYPE "MatchType_new" USING ("matchType"::text::"MatchType_new");
ALTER TYPE "MatchType" RENAME TO "MatchType_old";
ALTER TYPE "MatchType_new" RENAME TO "MatchType";
DROP TYPE "MatchType_old";
ALTER TABLE "InspectionRequest" ALTER COLUMN "matchType" SET DEFAULT 'PERFECT';
COMMIT;
