-- CreateIndex
CREATE INDEX "asset_allocations_companyId_idx" ON "asset_allocations"("companyId");

-- CreateIndex
CREATE INDEX "assets_name_idx" ON "assets"("name");

-- CreateIndex
CREATE INDEX "assets_brand_idx" ON "assets"("brand");

-- CreateIndex
CREATE INDEX "claims_isActive_occurrenceDate_idx" ON "claims"("isActive", "occurrenceDate");

-- CreateIndex
CREATE INDEX "policies_companyId_isActive_idx" ON "policies"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "policies_insuranceTypeId_isActive_idx" ON "policies"("insuranceTypeId", "isActive");
