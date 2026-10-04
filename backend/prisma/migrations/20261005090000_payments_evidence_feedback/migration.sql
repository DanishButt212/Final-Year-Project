-- Phase 4A: challan ledger, payment card summary, encrypted evidence vault, feedback workflow,
-- push notification preference, claim amount. Hand-written so existing rows are kept
-- (defaults are added, then dropped) and Feedback.category is converted instead of dropped.

-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('VIDEO', 'AUDIO', 'SCANNED_DOCUMENT');
CREATE TYPE "FeedbackCategory" AS ENUM ('USABILITY', 'TECHNICAL_ISSUE', 'SUGGESTION', 'OTHER');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'PROCESSED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "CaseEventType" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "CaseEventType" ADD VALUE 'EVIDENCE_ADDED';
ALTER TYPE "CaseEventType" ADD VALUE 'EVIDENCE_LOCKED';

-- Case
ALTER TABLE "Case" ADD COLUMN "claimAmountPkr" DECIMAL(14,2);

-- Challan (existing rows get an empty ledger and a blank hash, recalculated on the next request)
ALTER TABLE "Challan" ADD COLUMN "inputHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ledger" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Challan" ALTER COLUMN "inputHash" DROP DEFAULT, ALTER COLUMN "ledger" DROP DEFAULT;

-- Payment
ALTER TABLE "Payment" ADD COLUMN "cardBrand" TEXT,
ADD COLUMN "cardLast4" TEXT,
ADD COLUMN "failureReason" TEXT;

-- Evidence
DROP INDEX "Evidence_caseId_idx";
ALTER TABLE "Evidence" ADD COLUMN "authTag" TEXT NOT NULL DEFAULT '',
ADD COLUMN "category" "EvidenceCategory" NOT NULL DEFAULT 'SCANNED_DOCUMENT',
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "iv" TEXT NOT NULL DEFAULT '',
ADD COLUMN "lockReason" TEXT,
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockedById" TEXT,
ADD COLUMN "originalName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Evidence" ALTER COLUMN "authTag" DROP DEFAULT, ALTER COLUMN "category" DROP DEFAULT,
ALTER COLUMN "iv" DROP DEFAULT, ALTER COLUMN "originalName" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "Evidence_caseId_deletedAt_idx" ON "Evidence"("caseId", "deletedAt");
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feedback (the old free-text category is mapped onto the new enum)
ALTER TABLE "Feedback" ADD COLUMN "forwardToMaintenance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "category" TYPE "FeedbackCategory" USING (
  CASE
    WHEN "category" ILIKE 'usab%' THEN 'USABILITY'
    WHEN "category" ILIKE 'tech%' OR "category" ILIKE 'bug%' THEN 'TECHNICAL_ISSUE'
    WHEN "category" ILIKE 'sugg%' THEN 'SUGGESTION'
    ELSE 'OTHER'
  END::"FeedbackCategory"
);
UPDATE "Feedback" SET "category" = 'OTHER' WHERE "category" IS NULL;
ALTER TABLE "Feedback" ALTER COLUMN "category" SET NOT NULL, ALTER COLUMN "category" SET DEFAULT 'OTHER';
CREATE INDEX "Feedback_status_category_idx" ON "Feedback"("status", "category");
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NotificationPreference
ALTER TABLE "NotificationPreference" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT false;
