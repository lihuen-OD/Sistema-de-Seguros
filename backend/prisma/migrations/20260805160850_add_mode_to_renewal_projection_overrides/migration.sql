-- DropIndex
DROP INDEX "asset_renewal_projection_overrides_assetId_key";

-- AlterTable
ALTER TABLE "asset_renewal_projection_overrides" ADD COLUMN "mode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "asset_renewal_projection_overrides_assetId_mode_key" ON "asset_renewal_projection_overrides"("assetId", "mode");
