/*
  Warnings:

  - You are about to drop the column `readAt` on the `Chat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "readAt";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "readAt" TIMESTAMP(3);
