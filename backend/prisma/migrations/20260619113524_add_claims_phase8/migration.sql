/*
  Warnings:

  - You are about to drop the column `title` on the `claim_events` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `claimDate` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `claims` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[claimNumber]` on the table `claims` will be added. If there are existing duplicate values, this will fail.
  - Made the column `description` on table `claim_events` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `claimNumber` to the `claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `claimType` to the `claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `occurrenceDate` to the `claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reportDate` to the `claims` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "claim_events" DROP COLUMN "title",
ADD COLUMN     "amountLabel" TEXT,
ADD COLUMN     "newAmount" DOUBLE PRECISION,
ADD COLUMN     "newStatus" TEXT,
ADD COLUMN     "previousAmount" DOUBLE PRECISION,
ADD COLUMN     "previousStatus" TEXT,
ALTER COLUMN "description" SET NOT NULL;

-- AlterTable
ALTER TABLE "claims" DROP COLUMN "amount",
DROP COLUMN "claimDate",
DROP COLUMN "title",
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "claimNumber" TEXT NOT NULL,
ADD COLUMN     "claimType" TEXT NOT NULL,
ADD COLUMN     "claimedAmountArs" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "deductibleArs" DOUBLE PRECISION,
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "insuranceCompany" TEXT,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "occurrenceDate" TEXT NOT NULL,
ADD COLUMN     "realAmountArs" DOUBLE PRECISION,
ADD COLUMN     "reportDate" TEXT NOT NULL,
ADD COLUMN     "settledAmountArs" DOUBLE PRECISION,
ALTER COLUMN "status" SET DEFAULT 'denunciado';

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "claims"("claimNumber");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
