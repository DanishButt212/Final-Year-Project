ALTER TYPE "Role" ADD VALUE 'STENOGRAPHER';

CREATE TYPE "TranscriptStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'SIGNED');

ALTER TABLE "Hearing" ADD COLUMN "stenographerId" TEXT;
CREATE INDEX "Hearing_stenographerId_date_idx" ON "Hearing"("stenographerId", "date");
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_stenographerId_fkey"
  FOREIGN KEY ("stenographerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HearingTranscript" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hearingId" TEXT NOT NULL UNIQUE REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "TranscriptStatus" NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,
  "correctionNote" TEXT,
  "submittedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "approvedAt" TIMESTAMP(3),
  "signedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "signedAt" TIMESTAMP(3),
  "reviewPdfKey" TEXT,
  "reviewPdfSha256" TEXT,
  "signedPdfKey" TEXT,
  "signedPdfSha256" TEXT,
  "signingFingerprint" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "HearingTranscript_status_idx" ON "HearingTranscript"("status");
