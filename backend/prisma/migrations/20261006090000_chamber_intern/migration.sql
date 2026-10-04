-- CreateEnum
CREATE TYPE "ChamberLicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
BEGIN;
CREATE TYPE "DiaryReviewStatus_new" AS ENUM ('SUBMITTED', 'APPROVED', 'NEEDS_REVISION');
ALTER TABLE "public"."InternDiaryEntry" ALTER COLUMN "reviewStatus" DROP DEFAULT;
ALTER TABLE "InternDiaryEntry" ALTER COLUMN "reviewStatus" TYPE "DiaryReviewStatus_new" USING (CASE "reviewStatus"::text WHEN 'RETURNED' THEN 'NEEDS_REVISION' ELSE "reviewStatus"::text END::"DiaryReviewStatus_new");
ALTER TYPE "DiaryReviewStatus" RENAME TO "DiaryReviewStatus_old";
ALTER TYPE "DiaryReviewStatus_new" RENAME TO "DiaryReviewStatus";
DROP TYPE "public"."DiaryReviewStatus_old";
ALTER TABLE "InternDiaryEntry" ALTER COLUMN "reviewStatus" SET DEFAULT 'SUBMITTED';
COMMIT;

-- DropIndex
DROP INDEX "InternDiaryEntry_internId_entryDate_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "accuracyM" INTEGER,
ADD COLUMN     "courtId" TEXT;

-- AlterTable
ALTER TABLE "BillableEntry" ADD COLUMN     "amountPkr" DECIMAL(14,2);
UPDATE "BillableEntry" SET "amountPkr" = ROUND("hours" * "hourlyRate", 2);
ALTER TABLE "BillableEntry" ALTER COLUMN "amountPkr" SET NOT NULL;

-- AlterTable
ALTER TABLE "ChamberClient" ADD COLUMN     "caseType" TEXT,
ADD COLUMN     "clientCode" TEXT,
ADD COLUMN     "onboardedOn" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill client codes for existing rows (CL-<6 digits>, per chamber)
UPDATE "ChamberClient" c SET "clientCode" = 'CL-' || LPAD(r.n::text, 6, '0')
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "lawyerId" ORDER BY "createdAt", id) AS n FROM "ChamberClient") r
WHERE c.id = r.id;
ALTER TABLE "ChamberClient" ALTER COLUMN "clientCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "geofenceRadiusM" INTEGER,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "InternDiaryEntry" ADD COLUMN     "caseId" TEXT,
ADD COLUMN     "citation" TEXT NOT NULL DEFAULT 'Not recorded',
ADD COLUMN     "keywords" TEXT[];

ALTER TABLE "InternDiaryEntry" ALTER COLUMN "citation" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RetainerTransaction" ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "ChamberProfile" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "chamberCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeAddress" TEXT,
    "partnerNames" TEXT[],
    "barMembershipIds" TEXT[],
    "practiceVerticals" TEXT[],
    "phone" TEXT,
    "email" TEXT,
    "licenseStatus" "ChamberLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultHourlyRatePkr" DECIMAL(12,2) NOT NULL DEFAULT 15000,
    "lowBalanceThresholdPkr" DECIMAL(12,2) NOT NULL DEFAULT 20000,
    "lowBalanceNotifiedIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChamberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamberAlertLog" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "balancePkr" DECIMAL(14,2) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamberAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChamberProfile_lawyerId_key" ON "ChamberProfile"("lawyerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChamberProfile_chamberCode_key" ON "ChamberProfile"("chamberCode");

-- CreateIndex
CREATE INDEX "ChamberAlertLog_clientId_sentAt_idx" ON "ChamberAlertLog"("clientId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChamberClient_lawyerId_clientCode_key" ON "ChamberClient"("lawyerId", "clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "ChamberClient_lawyerId_cnic_key" ON "ChamberClient"("lawyerId", "cnic");

-- CreateIndex
CREATE INDEX "InternDiaryEntry_internId_createdAt_idx" ON "InternDiaryEntry"("internId", "createdAt");

-- CreateIndex
CREATE INDEX "InternDiaryEntry_caseId_idx" ON "InternDiaryEntry"("caseId");

-- AddForeignKey
ALTER TABLE "InternDiaryEntry" ADD CONSTRAINT "InternDiaryEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberProfile" ADD CONSTRAINT "ChamberProfile_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberAlertLog" ADD CONSTRAINT "ChamberAlertLog_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberAlertLog" ADD CONSTRAINT "ChamberAlertLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ChamberClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

