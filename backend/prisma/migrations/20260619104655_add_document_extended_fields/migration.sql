-- AlterTable
ALTER TABLE "accounting_documents" ADD COLUMN     "insuranceCompany" TEXT,
ADD COLUMN     "linkedDocumentId" TEXT,
ADD COLUMN     "paymentMethod" TEXT;

-- AlterTable
ALTER TABLE "document_installments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ARS';
