-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('SUMMONS', 'NOTICE');

-- CreateEnum
CREATE TYPE "SummonsPriority" AS ENUM ('URGENT', 'NORMAL');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('PERSONAL_DELIVERY', 'REFUSED_AFFIXED');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseEventType" ADD VALUE 'SUMMONS_ISSUED';
ALTER TYPE "CaseEventType" ADD VALUE 'SUMMONS_ATTEMPT';
ALTER TYPE "CaseEventType" ADD VALUE 'SUMMONS_EXECUTED';
ALTER TYPE "CaseEventType" ADD VALUE 'SUMMONS_REASSIGNED';
ALTER TYPE "CaseEventType" ADD VALUE 'SUMMONS_CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "SummonsStatus_new" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'ATTEMPT_IN_PROGRESS', 'EXECUTED', 'CANCELLED');
ALTER TABLE "public"."Summons" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Summons" ALTER COLUMN "status" TYPE "SummonsStatus_new" USING (CASE "status"::text WHEN 'PENDING' THEN 'PENDING_ASSIGNMENT' WHEN 'DELIVERED' THEN 'EXECUTED' WHEN 'FAILED' THEN 'CANCELLED' WHEN 'RETURNED' THEN 'CANCELLED' ELSE "status"::text END::"SummonsStatus_new");
ALTER TYPE "SummonsStatus" RENAME TO "SummonsStatus_old";
ALTER TYPE "SummonsStatus_new" RENAME TO "SummonsStatus";
DROP TYPE "public"."SummonsStatus_old";
ALTER TABLE "Summons" ALTER COLUMN "status" SET DEFAULT 'PENDING_ASSIGNMENT';
COMMIT;

-- AlterTable
ALTER TABLE "Summons" DROP COLUMN "attempts",
DROP COLUMN "deliveredAt",
DROP COLUMN "gpsLat",
DROP COLUMN "gpsLng",
DROP COLUMN "remarks",
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "executedAccuracy" DECIMAL(8,2),
ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "executedLat" DECIMAL(9,6),
ADD COLUMN     "executedLng" DECIMAL(9,6),
ADD COLUMN     "executionNotes" TEXT,
ADD COLUMN     "issuedById" TEXT,
ADD COLUMN     "noticeType" "NoticeType" NOT NULL DEFAULT 'SUMMONS',
ADD COLUMN     "photoIv" TEXT,
ADD COLUMN     "photoSha256" TEXT,
ADD COLUMN     "photoTag" TEXT,
ADD COLUMN     "priority" "SummonsPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "recipientCnic" TEXT,
ADD COLUMN     "seal" TEXT,
ADD COLUMN     "sealedAt" TIMESTAMP(3),
ADD COLUMN     "sector" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN     "serviceAddress" TEXT NOT NULL DEFAULT 'Address on file',
ADD COLUMN     "serviceMode" "ServiceMode",
ADD COLUMN     "signatureIv" TEXT,
ADD COLUMN     "signatureSha256" TEXT,
ADD COLUMN     "signatureTag" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_ASSIGNMENT',
ALTER COLUMN "recipientName" DROP NOT NULL;

UPDATE "Summons" s SET "recipientName" = COALESCE(s."recipientName", (SELECT p."name" FROM "CaseParty" p WHERE p."id" = s."partyId"), 'Recipient'), "photoPath" = NULL, "signaturePath" = NULL;
ALTER TABLE "Summons" ALTER COLUMN "recipientName" SET NOT NULL, ALTER COLUMN "sector" DROP DEFAULT, ALTER COLUMN "serviceAddress" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SummonsAttempt" (
    "id" TEXT NOT NULL,
    "summonsId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracyM" DECIMAL(8,2) NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "SummonsAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessServerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "phone" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'ACTIVE',
    "photoPath" TEXT,
    "photoIv" TEXT,
    "photoTag" TEXT,
    "photoSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "internProfileId" TEXT,

    CONSTRAINT "ProcessServerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SummonsAttempt_summonsId_createdAt_idx" ON "SummonsAttempt"("summonsId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessServerProfile_userId_key" ON "ProcessServerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessServerProfile_badgeNumber_key" ON "ProcessServerProfile"("badgeNumber");

-- CreateIndex
CREATE INDEX "ProcessServerProfile_courtId_idx" ON "ProcessServerProfile"("courtId");

-- CreateIndex
CREATE INDEX "Summons_status_dueBy_idx" ON "Summons"("status", "dueBy");

-- AddForeignKey
ALTER TABLE "Summons" ADD CONSTRAINT "Summons_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummonsAttempt" ADD CONSTRAINT "SummonsAttempt_summonsId_fkey" FOREIGN KEY ("summonsId") REFERENCES "Summons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummonsAttempt" ADD CONSTRAINT "SummonsAttempt_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessServerProfile" ADD CONSTRAINT "ProcessServerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessServerProfile" ADD CONSTRAINT "ProcessServerProfile_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessServerProfile" ADD CONSTRAINT "ProcessServerProfile_internProfileId_fkey" FOREIGN KEY ("internProfileId") REFERENCES "InternProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

