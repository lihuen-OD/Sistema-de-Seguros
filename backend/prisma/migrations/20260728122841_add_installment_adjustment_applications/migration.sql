-- CreateTable
CREATE TABLE "installment_adjustment_applications" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "deltaAmount" DOUBLE PRECISION NOT NULL,
    "deltaAmountArs" DOUBLE PRECISION NOT NULL,
    "deltaAmountUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_adjustment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_adjustment_applications_installmentId_idx" ON "installment_adjustment_applications"("installmentId");

-- CreateIndex
CREATE INDEX "installment_adjustment_applications_sourceDocumentId_idx" ON "installment_adjustment_applications"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "installment_adjustment_applications" ADD CONSTRAINT "installment_adjustment_applications_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "document_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_adjustment_applications" ADD CONSTRAINT "installment_adjustment_applications_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "accounting_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
