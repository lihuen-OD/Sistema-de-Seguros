-- CreateTable
CREATE TABLE "document_audit_logs" (
    "id" TEXT NOT NULL,
    "accountingDocumentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "performedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_audit_logs_accountingDocumentId_idx" ON "document_audit_logs"("accountingDocumentId");

-- AddForeignKey
ALTER TABLE "document_audit_logs" ADD CONSTRAINT "document_audit_logs_accountingDocumentId_fkey" FOREIGN KEY ("accountingDocumentId") REFERENCES "accounting_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
