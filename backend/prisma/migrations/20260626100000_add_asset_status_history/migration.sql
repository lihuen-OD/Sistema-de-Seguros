CREATE TABLE "asset_status_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_status_history_assetId_idx" ON "asset_status_history"("assetId");
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
