-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_inspectionRequestId_fkey";

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_inspectionRequestId_fkey" FOREIGN KEY ("inspectionRequestId") REFERENCES "InspectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
