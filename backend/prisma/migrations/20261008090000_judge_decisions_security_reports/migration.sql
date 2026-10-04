-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('JUDGMENT', 'DISMISSED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "SecurityAlertStatus" AS ENUM ('OPEN', 'DISMISSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('PERFORMANCE', 'AUDIT_TRAIL');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'EXCEL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseEventType" ADD VALUE 'HEARING_COMPLETED';
ALTER TYPE "CaseEventType" ADD VALUE 'HEARING_ADJOURNED';
ALTER TYPE "CaseEventType" ADD VALUE 'CASE_DECIDED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "eventHash" TEXT;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "decisionText" TEXT,
ADD COLUMN     "decisionType" "DecisionType";

-- AlterTable
ALTER TABLE "Hearing" ADD COLUMN     "outcomeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsInvalidatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "role" "Role",
    "ip" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" "Role",
    "ip" TEXT,
    "attemptCount" INTEGER NOT NULL,
    "lastActionCode" TEXT NOT NULL,
    "lastRoute" TEXT,
    "status" "SecurityAlertStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedHost" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "alertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "params" JSONB NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "dataSha256" TEXT NOT NULL,
    "seal" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_actorId_createdAt_idx" ON "SecurityEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_ip_createdAt_idx" ON "SecurityEvent"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlert_status_createdAt_idx" ON "SecurityAlert"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedHost_ip_key" ON "BlockedHost"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedReport_code_key" ON "GeneratedReport"("code");

-- CreateIndex
CREATE INDEX "GeneratedReport_createdAt_idx" ON "GeneratedReport"("createdAt");

-- AddForeignKey
ALTER TABLE "BlockedHost" ADD CONSTRAINT "BlockedHost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedHost" ADD CONSTRAINT "BlockedHost_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SecurityAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one OPEN alert per offending account, and per offending host when the account is unknown.
-- (Prisma cannot express partial unique indexes, so this is hand-written.)
CREATE UNIQUE INDEX "SecurityAlert_open_actor_key" ON "SecurityAlert"("actorId") WHERE "status" = 'OPEN' AND "actorId" IS NOT NULL;
CREATE UNIQUE INDEX "SecurityAlert_open_ip_key" ON "SecurityAlert"("ip") WHERE "status" = 'OPEN' AND "actorId" IS NULL AND "ip" IS NOT NULL;
