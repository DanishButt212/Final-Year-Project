-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Case_decidedAt_idx" ON "Case"("decidedAt");

-- CreateIndex
CREATE INDEX "Hearing_outcomeAt_idx" ON "Hearing"("outcomeAt");
