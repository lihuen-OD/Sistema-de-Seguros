-- CreateIndex
CREATE INDEX "accounting_documents_paymentStatus_idx" ON "accounting_documents"("paymentStatus");

-- CreateIndex
CREATE INDEX "accounting_documents_issueDate_idx" ON "accounting_documents"("issueDate");

-- CreateIndex
CREATE INDEX "accounting_documents_documentType_idx" ON "accounting_documents"("documentType");

-- CreateIndex
CREATE INDEX "asset_allocations_assetId_idx" ON "asset_allocations"("assetId");

-- CreateIndex
CREATE INDEX "asset_allocations_costCenterId_idx" ON "asset_allocations"("costCenterId");

-- CreateIndex
CREATE INDEX "asset_attachments_assetId_idx" ON "asset_attachments"("assetId");

-- CreateIndex
CREATE INDEX "asset_value_history_assetId_idx" ON "asset_value_history"("assetId");

-- CreateIndex
CREATE INDEX "assets_isActive_status_idx" ON "assets"("isActive", "status");

-- CreateIndex
CREATE INDEX "assets_isActive_assetType_idx" ON "assets"("isActive", "assetType");

-- CreateIndex
CREATE INDEX "claim_attachments_claimId_idx" ON "claim_attachments"("claimId");

-- CreateIndex
CREATE INDEX "claim_events_claimId_idx" ON "claim_events"("claimId");

-- CreateIndex
CREATE INDEX "claims_isActive_status_idx" ON "claims"("isActive", "status");

-- CreateIndex
CREATE INDEX "claims_policyId_idx" ON "claims"("policyId");

-- CreateIndex
CREATE INDEX "claims_assetId_idx" ON "claims"("assetId");

-- CreateIndex
CREATE INDEX "claims_occurrenceDate_idx" ON "claims"("occurrenceDate");

-- CreateIndex
CREATE INDEX "document_attachments_accountingDocumentId_idx" ON "document_attachments"("accountingDocumentId");

-- CreateIndex
CREATE INDEX "document_installments_accountingDocumentId_idx" ON "document_installments"("accountingDocumentId");

-- CreateIndex
CREATE INDEX "document_policy_allocations_accountingDocumentId_idx" ON "document_policy_allocations"("accountingDocumentId");

-- CreateIndex
CREATE INDEX "document_policy_allocations_policyId_idx" ON "document_policy_allocations"("policyId");

-- CreateIndex
CREATE INDEX "fire_extinguisher_history_fireExtinguisherId_idx" ON "fire_extinguisher_history"("fireExtinguisherId");

-- CreateIndex
CREATE INDEX "fire_extinguishers_assetId_idx" ON "fire_extinguishers"("assetId");

-- CreateIndex
CREATE INDEX "insurance_coverages_insuranceTypeId_idx" ON "insurance_coverages"("insuranceTypeId");

-- CreateIndex
CREATE INDEX "policies_companyId_idx" ON "policies"("companyId");

-- CreateIndex
CREATE INDEX "policies_insuranceTypeId_idx" ON "policies"("insuranceTypeId");

-- CreateIndex
CREATE INDEX "policies_producerId_idx" ON "policies"("producerId");

-- CreateIndex
CREATE INDEX "policies_assetId_idx" ON "policies"("assetId");

-- CreateIndex
CREATE INDEX "policy_attachments_policyId_idx" ON "policy_attachments"("policyId");

-- CreateIndex
CREATE INDEX "producer_tasks_producerId_status_idx" ON "producer_tasks"("producerId", "status");

-- CreateIndex
CREATE INDEX "producer_tasks_dueDate_status_idx" ON "producer_tasks"("dueDate", "status");

-- CreateIndex
CREATE INDEX "producer_tasks_policyId_idx" ON "producer_tasks"("policyId");

-- CreateIndex
CREATE INDEX "producer_tasks_assetId_idx" ON "producer_tasks"("assetId");
