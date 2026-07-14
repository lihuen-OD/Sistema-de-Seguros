-- CreateIndex
CREATE INDEX "asset_attachments_expirationDate_idx" ON "asset_attachments"("expirationDate");

-- CreateIndex
CREATE INDEX "policy_attachments_expirationDate_idx" ON "policy_attachments"("expirationDate");

-- CreateIndex
CREATE INDEX "accounting_documents_linkedDocumentId_idx" ON "accounting_documents"("linkedDocumentId");
