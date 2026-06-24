/*
  Warnings:

  - You are about to drop the column `area` on the `cost_centers` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `cost_centers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `assets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `asset_allocations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "cost_centers" DROP CONSTRAINT "cost_centers_companyId_fkey";

-- AlterTable
ALTER TABLE "asset_allocations" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "area" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "fixedAssetCode" TEXT,
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "productiveUnit" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'activo',
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "cost_centers" DROP COLUMN "area",
DROP COLUMN "companyId";

-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "beneficiaryDescription" TEXT,
ADD COLUMN     "costCenterId" TEXT;

-- AlterTable
ALTER TABLE "producer_tasks" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'media';

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");

-- AddForeignKey
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
