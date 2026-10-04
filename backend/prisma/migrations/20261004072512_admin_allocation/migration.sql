-- AlterEnum
ALTER TYPE "CaseEventType" ADD VALUE 'CASE_ALLOCATED';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "courtroomId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_courtroomId_fkey" FOREIGN KEY ("courtroomId") REFERENCES "Courtroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
