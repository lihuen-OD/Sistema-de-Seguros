-- CreateTable
CREATE TABLE "asset_pledges" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdBy" TEXT,
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pledges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_pledges_assetId_createdAt_idx" ON "asset_pledges"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_pledges_endDate_idx" ON "asset_pledges"("endDate");

-- Prisma does not represent partial indexes in schema.prisma. Keep this
-- database constraint when changing or regenerating future migrations.
CREATE UNIQUE INDEX "asset_pledges_one_active_per_asset"
ON "asset_pledges" ("assetId")
WHERE "cancelledAt" IS NULL;

-- AddForeignKey (RESTRICT preserves pledge history on hard delete)
ALTER TABLE "asset_pledges" ADD CONSTRAINT "asset_pledges_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
