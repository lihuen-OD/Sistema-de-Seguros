-- AlterTable
ALTER TABLE "cost_centers" ADD COLUMN     "area" TEXT,
ADD COLUMN     "companyId" TEXT;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
