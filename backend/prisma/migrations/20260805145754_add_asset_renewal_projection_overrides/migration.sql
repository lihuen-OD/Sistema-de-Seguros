-- CreateTable
CREATE TABLE "asset_renewal_projection_overrides" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "netOverride" DOUBLE PRECISION,
    "vatOverride" DOUBLE PRECISION,
    "otherOverride" DOUBLE PRECISION,
    "growthPercentOverride" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_renewal_projection_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_renewal_projection_overrides_assetId_key" ON "asset_renewal_projection_overrides"("assetId");

-- AddForeignKey
ALTER TABLE "asset_renewal_projection_overrides" ADD CONSTRAINT "asset_renewal_projection_overrides_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
