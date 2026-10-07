-- Phase 4F: virtual courtroom (hand-written; existing data is kept).

-- AlterEnum: new case event types
ALTER TYPE "CaseEventType" ADD VALUE 'SESSION_INITIALIZED';
ALTER TYPE "CaseEventType" ADD VALUE 'SESSION_ENDED';

-- AlterEnum: admins can sit in a session
ALTER TYPE "ParticipantRole" ADD VALUE 'ADMIN';

-- Replace SessionStatus (SCHEDULED, LIVE, ENDED, CANCELLED) with (LOBBY_LOCKED, ACTIVE, ENDED); old rows are mapped.
ALTER TYPE "SessionStatus" RENAME TO "SessionStatus_old";
CREATE TYPE "SessionStatus" AS ENUM ('LOBBY_LOCKED', 'ACTIVE', 'ENDED');
ALTER TABLE "CourtSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CourtSession" ALTER COLUMN "status" TYPE "SessionStatus" USING (
  CASE "status"::text
    WHEN 'SCHEDULED' THEN 'LOBBY_LOCKED'
    WHEN 'LIVE' THEN 'ACTIVE'
    ELSE 'ENDED'
  END
)::"SessionStatus";
ALTER TABLE "CourtSession" ALTER COLUMN "status" SET DEFAULT 'LOBBY_LOCKED';
DROP TYPE "SessionStatus_old";

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('JOINED', 'MUTED', 'VIDEO_OFF', 'EJECTED');

-- CreateEnum
CREATE TYPE "SessionCommand" AS ENUM ('MUTE_AUDIO', 'DISABLE_VIDEO', 'EJECT', 'READMIT');

-- AlterTable: Hearing
ALTER TABLE "Hearing" ADD COLUMN "isVirtual" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Hearing" SET "isVirtual" = true WHERE "type" = 'VIRTUAL';

-- AlterTable: CourtSession (createdById becomes initializedById; scheduledAt comes from the hearing)
ALTER TABLE "CourtSession" RENAME COLUMN "createdById" TO "initializedById";
ALTER TABLE "CourtSession" RENAME CONSTRAINT "CourtSession_createdById_fkey" TO "CourtSession_initializedById_fkey";
ALTER TABLE "CourtSession" DROP COLUMN "scheduledAt";
ALTER TABLE "CourtSession" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'JITSI_PUBLIC';
ALTER TABLE "CourtSession" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CourtSession" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "CourtSession_status_idx" ON "CourtSession"("status");

-- AlterTable: CourtSessionParticipant
ALTER TABLE "CourtSessionParticipant"
  ADD COLUMN "status" "ParticipantStatus" NOT NULL DEFAULT 'JOINED',
  ADD COLUMN "audioMuted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "videoOff" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "providerParticipantId" TEXT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastCommand" "SessionCommand",
  ADD COLUMN "lastCommandAt" TIMESTAMP(3),
  ADD COLUMN "lastCommandById" TEXT;
