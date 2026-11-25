-- CreateEnum
CREATE TYPE "HearingCoverageStatus" AS ENUM ('NEEDS_NOMINEE', 'CHAMBER_PENDING', 'NOMINEE_PENDING', 'READER_PENDING', 'JUDGE_PENDING', 'APPROVED', 'REJECTED', 'RESCHEDULE_REQUIRED', 'RESCHEDULED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Hearing" ADD COLUMN     "lastSummons" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChamberMembership" (
    "lawyerId" TEXT NOT NULL,
    "chamberId" TEXT NOT NULL,

    CONSTRAINT "ChamberMembership_pkey" PRIMARY KEY ("lawyerId")
);

-- CreateTable
CREATE TABLE "HearingCoverage" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "substituteId" TEXT,
    "chamberId" TEXT,
    "hearingDate" DATE NOT NULL,
    "hearingSlot" INTEGER NOT NULL,
    "status" "HearingCoverageStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "decisionNote" TEXT,
    "readerId" TEXT,
    "readerAt" TIMESTAMP(3),
    "judgeId" TEXT,
    "judgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HearingCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingAbsence" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "hearingDate" DATE NOT NULL,
    "judgeId" TEXT NOT NULL,
    "fineRequired" BOOLEAN NOT NULL,
    "fineAmount" DECIMAL(12,2),
    "reason" TEXT NOT NULL,
    "readerId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finedAt" TIMESTAMP(3),

    CONSTRAINT "HearingAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChamberMembership_chamberId_idx" ON "ChamberMembership"("chamberId");

-- CreateIndex
CREATE INDEX "HearingCoverage_substituteId_hearingDate_status_idx" ON "HearingCoverage"("substituteId", "hearingDate", "status");

-- CreateIndex
CREATE INDEX "HearingCoverage_chamberId_status_idx" ON "HearingCoverage"("chamberId", "status");

-- CreateIndex
CREATE INDEX "HearingCoverage_status_idx" ON "HearingCoverage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HearingCoverage_hearingId_originalId_hearingDate_hearingSlo_key" ON "HearingCoverage"("hearingId", "originalId", "hearingDate", "hearingSlot");

-- CreateIndex
CREATE INDEX "HearingAbsence_fineRequired_fineAmount_idx" ON "HearingAbsence"("fineRequired", "fineAmount");

-- CreateIndex
CREATE UNIQUE INDEX "HearingAbsence_hearingId_lawyerId_hearingDate_key" ON "HearingAbsence"("hearingId", "lawyerId", "hearingDate");

-- AddForeignKey
ALTER TABLE "ChamberMembership" ADD CONSTRAINT "ChamberMembership_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberMembership" ADD CONSTRAINT "ChamberMembership_chamberId_fkey" FOREIGN KEY ("chamberId") REFERENCES "ChamberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingCoverage" ADD CONSTRAINT "HearingCoverage_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingCoverage" ADD CONSTRAINT "HearingCoverage_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingCoverage" ADD CONSTRAINT "HearingCoverage_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "LawyerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingCoverage" ADD CONSTRAINT "HearingCoverage_chamberId_fkey" FOREIGN KEY ("chamberId") REFERENCES "ChamberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingAbsence" ADD CONSTRAINT "HearingAbsence_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingAbsence" ADD CONSTRAINT "HearingAbsence_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

