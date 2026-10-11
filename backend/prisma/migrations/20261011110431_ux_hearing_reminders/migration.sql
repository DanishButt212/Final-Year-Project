-- CreateTable
CREATE TABLE "HearingReminder" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hearingDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HearingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HearingReminder_hearingDate_idx" ON "HearingReminder"("hearingDate");

-- CreateIndex
CREATE UNIQUE INDEX "HearingReminder_hearingId_userId_hearingDate_key" ON "HearingReminder"("hearingId", "userId", "hearingDate");

-- AddForeignKey
ALTER TABLE "HearingReminder" ADD CONSTRAINT "HearingReminder_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingReminder" ADD CONSTRAINT "HearingReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
