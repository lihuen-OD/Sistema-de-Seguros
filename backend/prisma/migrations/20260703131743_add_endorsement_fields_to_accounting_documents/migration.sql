-- AlterTable
ALTER TABLE "accounting_documents" ADD COLUMN     "economicImpactType" TEXT,
ADD COLUMN     "endorsementEffectiveDate" DATE,
ADD COLUMN     "endorsementType" TEXT,
ADD COLUMN     "policyId" TEXT;

-- CreateIndex
CREATE INDEX "accounting_documents_policyId_idx" ON "accounting_documents"("policyId");

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
