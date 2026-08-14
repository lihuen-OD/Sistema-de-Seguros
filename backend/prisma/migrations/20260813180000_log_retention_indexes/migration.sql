-- CreateIndex
-- Soporta el borrado periódico por antigüedad (WHERE "createdAt" < cutoff)
-- de las 4 tablas de log con ventana de retención — ver backend/scripts/cleanup-old-logs.ts.
CREATE INDEX "document_audit_logs_createdAt_idx" ON "document_audit_logs"("createdAt");
CREATE INDEX "fire_extinguisher_history_createdAt_idx" ON "fire_extinguisher_history"("createdAt");
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");
CREATE INDEX "user_audit_logs_createdAt_idx" ON "user_audit_logs"("createdAt");
