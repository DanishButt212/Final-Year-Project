-- Retire only the virtual courtroom module; retain hearings and case history.
DROP TABLE "CourtSessionParticipant";
DROP TABLE "CourtSession";
DROP TYPE "SessionCommand";
DROP TYPE "ParticipantStatus";
DROP TYPE "ParticipantRole";
DROP TYPE "SessionStatus";
ALTER TABLE "Hearing" DROP COLUMN "isVirtual";
UPDATE "Hearing" SET "type" = 'PHYSICAL' WHERE "type" = 'VIRTUAL';
ALTER TYPE "HearingType" RENAME TO "HearingType_old";
CREATE TYPE "HearingType" AS ENUM ('PHYSICAL');
ALTER TABLE "Hearing" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Hearing" ALTER COLUMN "type" TYPE "HearingType" USING ("type"::text::"HearingType");
ALTER TABLE "Hearing" ALTER COLUMN "type" SET DEFAULT 'PHYSICAL';
DROP TYPE "HearingType_old";
