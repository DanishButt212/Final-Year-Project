-- Phase 5B: intern completion certificate (one per intern, sealed).
-- CreateTable
CREATE TABLE "InternCertificate" (
    "id" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "lawyerProfileId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "internName" TEXT NOT NULL,
    "lawyerName" TEXT NOT NULL,
    "chamberName" TEXT NOT NULL,
    "chamberCode" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "approvedLogs" INTEGER NOT NULL,
    "attendanceDays" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seal" TEXT NOT NULL,

    CONSTRAINT "InternCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternCertificate_certificateNo_key" ON "InternCertificate"("certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "InternCertificate_internId_key" ON "InternCertificate"("internId");

-- CreateIndex
CREATE INDEX "InternCertificate_lawyerProfileId_idx" ON "InternCertificate"("lawyerProfileId");

-- AddForeignKey
ALTER TABLE "InternCertificate" ADD CONSTRAINT "InternCertificate_internId_fkey" FOREIGN KEY ("internId") REFERENCES "InternProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternCertificate" ADD CONSTRAINT "InternCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

