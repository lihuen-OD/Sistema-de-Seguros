-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "ownershipType" TEXT NOT NULL DEFAULT 'propio',
ADD COLUMN     "responsiblePersonName" TEXT,
ADD COLUMN     "thirdPartyContact" TEXT,
ADD COLUMN     "thirdPartyInsuranceCompany" TEXT,
ADD COLUMN     "thirdPartyInsurerContact" TEXT;

-- CreateTable
CREATE TABLE "claim_expenses" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherTaxesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "claim_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_expenses_claimId_idx" ON "claim_expenses"("claimId");

-- AddForeignKey
ALTER TABLE "claim_expenses" ADD CONSTRAINT "claim_expenses_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
