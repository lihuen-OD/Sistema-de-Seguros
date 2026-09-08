-- Fase 1 — Ciclo de vida de PolicyAssetCoverage (alta/baja historizada).
-- No borra filas, no toca policy_attachments, document_policy_allocations ni
-- ningún documento contable. Solo agrega columnas + backfill + reemplazo del
-- unique global por uno parcial.

-- AlterTable: columnas nuevas de ciclo de vida.
ALTER TABLE "policy_asset_coverages" ADD COLUMN "effectiveDate" DATE;
ALTER TABLE "policy_asset_coverages" ADD COLUMN "bajaDate" DATE;
ALTER TABLE "policy_asset_coverages" ADD COLUMN "bajaReason" TEXT;
ALTER TABLE "policy_asset_coverages" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "policy_asset_coverages" ADD COLUMN "deactivatedBy" TEXT;

-- Backfill: las líneas existentes arrancan su vigencia en la fecha de inicio
-- de su póliza (decisión de negocio ya confirmada — no hay forma de saber la
-- fecha real de alta histórica de cada activo dentro de la póliza).
UPDATE "policy_asset_coverages" pac
SET "effectiveDate" = p."startDate"
FROM "policies" p
WHERE p."id" = pac."policyId";

-- NOT NULL recién después del backfill.
ALTER TABLE "policy_asset_coverages" ALTER COLUMN "effectiveDate" SET NOT NULL;

-- DropIndex: unique global (policyId, assetId). Nombre confirmado contra la
-- migración que lo creó (20260730120000_add_policy_asset_coverage), no
-- asumido por convención.
DROP INDEX "policy_asset_coverages_policyId_assetId_key";

-- CreateIndex: único parcial — una sola línea ACTIVA (bajaDate IS NULL) por
-- (policyId, assetId) cuando assetId no es null. A diferencia del unique
-- global anterior, esto permite que el mismo activo tenga más de una línea
-- histórica en la misma póliza siempre que a lo sumo una esté sin dar de
-- baja (re-alta, a validar en Fase 2). Prisma no representa índices únicos
-- parciales en el schema — mismo patrón ya usado en
-- asset_pledges_one_active_per_asset (20260904153000_add_asset_pledges) y
-- assets_licensePlateNormalized_unique (20260907120000_add_license_plate_normalized).
CREATE UNIQUE INDEX "policy_asset_coverages_one_active_per_asset"
  ON "policy_asset_coverages" ("policyId", "assetId")
  WHERE "bajaDate" IS NULL AND "assetId" IS NOT NULL;
