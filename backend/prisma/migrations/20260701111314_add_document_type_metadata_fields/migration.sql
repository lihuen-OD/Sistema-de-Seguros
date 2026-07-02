-- AlterTable
ALTER TABLE "accounting_documents" ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "adjustmentSign" TEXT,
ADD COLUMN     "documentStatus" TEXT NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "relationType" TEXT,
ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "document_installments" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "accounting_documents_documentStatus_idx" ON "accounting_documents"("documentStatus");
