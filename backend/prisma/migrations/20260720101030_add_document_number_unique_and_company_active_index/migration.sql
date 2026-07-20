-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_documentType_insuranceCompany_document_key" ON "accounting_documents"("documentType", "insuranceCompany", "documentNumber");

-- CreateIndex
CREATE INDEX "companies_isActive_idx" ON "companies"("isActive");
