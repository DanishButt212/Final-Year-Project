ALTER TABLE "Hearing" ADD COLUMN "readerId" TEXT;
ALTER TABLE "HearingAbsence" ALTER COLUMN "fineRequired" DROP NOT NULL,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "assignedReaderId" TEXT;

UPDATE "Hearing" h SET "readerId" = COALESCE(
  (SELECT a."actorId" FROM "AuditLog" a JOIN "User" u ON u.id = a."actorId"
   WHERE a."entityId" = h.id AND a.entity = 'Hearing' AND a.success
     AND a.action IN ('HEARING_SCHEDULED', 'HEARING_RESCHEDULED') AND u.role = 'ADMIN' AND u.status = 'ACTIVE'
   ORDER BY a."createdAt", a.id LIMIT 1),
  (SELECT e."actorId" FROM "CaseEvent" e JOIN "User" u ON u.id = e."actorId"
   WHERE e."caseId" = h."caseId" AND e.type = 'CASE_ALLOCATED' AND u.role = 'ADMIN' AND u.status = 'ACTIVE'
   ORDER BY e."createdAt" DESC, e.id DESC LIMIT 1)
);
UPDATE "HearingAbsence" a SET "decidedAt" = a."recordedAt",
  "assignedReaderId" = COALESCE(a."readerId", h."readerId")
FROM "Hearing" h WHERE h.id = a."hearingId" AND a."fineRequired" = true;
UPDATE "HearingAbsence" SET "decidedAt" = "recordedAt" WHERE "fineRequired" = false;

DROP INDEX "HearingAbsence_fineRequired_fineAmount_idx";
CREATE INDEX "HearingAbsence_assignedReaderId_fineRequired_fineAmount_idx"
  ON "HearingAbsence" ("assignedReaderId", "fineRequired", "fineAmount");
