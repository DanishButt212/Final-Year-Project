-- CreateEnum
CREATE TYPE "CaseEventType" AS ENUM ('CASE_SUBMITTED', 'DOCUMENT_ATTACHED');

-- AlterEnum
ALTER TYPE "CaseStatus" ADD VALUE 'PENDING_ASSIGNMENT';

-- AlterTable
-- Defaults let this run on a database that already has documents; they are dropped straight away.
ALTER TABLE "CaseDocument" ADD COLUMN     "originalName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sha256" TEXT NOT NULL DEFAULT '';
UPDATE "CaseDocument" SET "originalName" = "title" WHERE "originalName" = '';
ALTER TABLE "CaseDocument" ALTER COLUMN "originalName" DROP DEFAULT, ALTER COLUMN "sha256" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CaseParty" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "CaseEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseCounter" (
    "year" INTEGER NOT NULL,
    "typeCode" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseCounter_pkey" PRIMARY KEY ("year","typeCode")
);

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: move cases created by the Phase 1 seed (UCN like DA-2026-MUL-000001) to the new format
-- DA-<YYYY>-<TYPECODE>-<6 digit sequence>, then start the counters after the highest number used.
WITH numbered AS (
  SELECT
    c."id",
    EXTRACT(YEAR FROM COALESCE(c."filingDate", c."createdAt"))::int AS yr,
    CASE c."caseType"
      WHEN 'CIVIL_SUIT' THEN 'CIV'
      WHEN 'CRIMINAL_APPEAL' THEN 'CRA'
      WHEN 'WRIT_PETITION' THEN 'WRT'
      WHEN 'BAIL_APPLICATION' THEN 'BAL'
    END AS code,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM COALESCE(c."filingDate", c."createdAt"))::int, c."caseType"
      ORDER BY c."createdAt", c."id"
    ) AS rn
  FROM "Case" c
  WHERE c."ucn" !~ '^DA-[0-9]{4}-(CIV|CRA|WRT|BAL)-[0-9]{6}$'
)
UPDATE "Case" c
SET "ucn" = 'DA-' || n.yr || '-' || n.code || '-' || LPAD(n.rn::text, 6, '0')
FROM numbered n
WHERE c."id" = n."id";

INSERT INTO "CaseCounter" ("year", "typeCode", "lastValue", "updatedAt")
SELECT
  SUBSTRING("ucn" FROM 4 FOR 4)::int,
  SUBSTRING("ucn" FROM 9 FOR 3),
  MAX(SUBSTRING("ucn" FROM 13 FOR 6)::int),
  CURRENT_TIMESTAMP
FROM "Case"
WHERE "ucn" ~ '^DA-[0-9]{4}-(CIV|CRA|WRT|BAL)-[0-9]{6}$'
GROUP BY 1, 2;

-- Existing cases get a CASE_SUBMITTED event so every case has a lifecycle history.
INSERT INTO "CaseEvent" ("id", "caseId", "type", "description", "actorId", "createdAt")
SELECT gen_random_uuid()::text, c."id", 'CASE_SUBMITTED', 'Case submitted (' || c."ucn" || ')', c."filedById", c."createdAt"
FROM "Case" c;
