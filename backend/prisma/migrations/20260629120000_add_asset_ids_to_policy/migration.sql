-- Migration: Replace scalar assetId with assetIds array on Policy
-- Preserves existing data by migrating non-null assetId values into the new array column

ALTER TABLE "policies" ADD COLUMN "assetIds" TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing single asset references into the new array
UPDATE "policies" SET "assetIds" = ARRAY["assetId"::TEXT] WHERE "assetId" IS NOT NULL;

-- Drop old column and its index
DROP INDEX IF EXISTS "policies_assetId_idx";
ALTER TABLE "policies" DROP COLUMN "assetId";
