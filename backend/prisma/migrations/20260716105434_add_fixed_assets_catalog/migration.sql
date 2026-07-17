-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "fixedAssetId" TEXT;

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "incorporationDate" DATE NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL,
    "depreciationRate" DOUBLE PRECISION NOT NULL,
    "originalValueArs" DOUBLE PRECISION NOT NULL,
    "bookValueArs" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_code_key" ON "fixed_assets"("code");

-- CreateIndex
CREATE INDEX "assets_fixedAssetId_idx" ON "assets"("fixedAssetId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
