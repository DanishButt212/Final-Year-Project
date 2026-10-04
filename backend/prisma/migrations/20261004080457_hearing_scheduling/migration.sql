-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseEventType" ADD VALUE 'HEARING_SCHEDULED';
ALTER TYPE "CaseEventType" ADD VALUE 'HEARING_RESCHEDULED';
ALTER TYPE "CaseEventType" ADD VALUE 'HEARING_CANCELLED';

-- DropIndex
DROP INDEX "Hearing_judgeId_date_timeSlot_key";

-- CreateIndex
CREATE INDEX "Hearing_judgeId_date_timeSlot_idx" ON "Hearing"("judgeId", "date", "timeSlot");

-- Safety net for anti-clash scheduling: a judge and a courtroom can hold only one NON-cancelled
-- hearing per date and slot. Cancelled hearings release the slot. Prisma cannot model partial
-- indexes, so they live only in this SQL (Prisma ignores them when diffing).
CREATE UNIQUE INDEX "Hearing_judge_slot_active_key"
  ON "Hearing" ("judgeId", "date", "timeSlot")
  WHERE "status" <> 'CANCELLED';

CREATE UNIQUE INDEX "Hearing_courtroom_slot_active_key"
  ON "Hearing" ("courtroomId", "date", "timeSlot")
  WHERE "status" <> 'CANCELLED' AND "courtroomId" IS NOT NULL;
