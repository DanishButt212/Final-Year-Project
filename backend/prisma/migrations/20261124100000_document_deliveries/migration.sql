-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('ASSIGNED', 'OUT_FOR_DELIVERY', 'REPORTED', 'CLARIFICATION_REQUESTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('DELIVERED', 'UNAVAILABLE', 'REFUSED', 'INCORRECT_ADDRESS');

-- CreateEnum
CREATE TYPE "DeliveryReviewAction" AS ENUM ('ACCEPT', 'REQUEST_CLARIFICATION', 'CLARIFICATION_REPLY', 'RETRY', 'FORWARD');

-- AlterEnum
ALTER TYPE "CaseEventType" ADD VALUE 'DELIVERY_REPORT_FORWARDED';

-- CreateTable
CREATE TABLE "DocumentDelivery" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "hearingId" TEXT,
    "dueDate" DATE NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "DeliveryOutcome" NOT NULL,
    "remarks" TEXT NOT NULL,
    "receivedBy" TEXT,
    "reason" TEXT,
    "ackKey" TEXT,
    "ackIv" TEXT,
    "ackTag" TEXT,
    "ackType" TEXT,

    CONSTRAINT "DocumentDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDeliveryReview" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "DeliveryReviewAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDeliveryReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentDelivery_caseId_idx" ON "DocumentDelivery"("caseId");

-- CreateIndex
CREATE INDEX "DocumentDelivery_serverId_status_idx" ON "DocumentDelivery"("serverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDelivery_documentId_recipientId_key" ON "DocumentDelivery"("documentId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDeliveryAttempt_deliveryId_number_key" ON "DocumentDeliveryAttempt"("deliveryId", "number");

-- CreateIndex
CREATE INDEX "DocumentDeliveryReview_attemptId_createdAt_idx" ON "DocumentDeliveryReview"("attemptId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CaseDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CaseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDeliveryAttempt" ADD CONSTRAINT "DocumentDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "DocumentDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDeliveryAttempt" ADD CONSTRAINT "DocumentDeliveryAttempt_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDeliveryReview" ADD CONSTRAINT "DocumentDeliveryReview_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DocumentDeliveryAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDeliveryReview" ADD CONSTRAINT "DocumentDeliveryReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

