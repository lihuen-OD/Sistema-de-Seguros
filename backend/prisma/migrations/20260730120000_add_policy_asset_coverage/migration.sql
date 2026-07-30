-- CreateTable
CREATE TABLE "policy_asset_coverages" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "assetId" TEXT,
    "insuranceTypeId" TEXT NOT NULL,
    "coverageIds" TEXT[],
    "insuredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "insuredAmountArs" DOUBLE PRECISION,
    "insuredAmountUsd" DOUBLE PRECISION,
    "companyId" TEXT,
    "costCenterId" TEXT,
    "beneficiaryDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_asset_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_asset_coverages_policyId_assetId_key" ON "policy_asset_coverages"("policyId", "assetId");

-- CreateIndex
CREATE INDEX "policy_asset_coverages_policyId_idx" ON "policy_asset_coverages"("policyId");

-- CreateIndex
CREATE INDEX "policy_asset_coverages_assetId_idx" ON "policy_asset_coverages"("assetId");

-- CreateIndex
CREATE INDEX "policy_asset_coverages_insuranceTypeId_idx" ON "policy_asset_coverages"("insuranceTypeId");

-- CreateIndex
CREATE INDEX "policy_asset_coverages_companyId_idx" ON "policy_asset_coverages"("companyId");

-- CreateIndex
CREATE INDEX "policy_asset_coverages_costCenterId_idx" ON "policy_asset_coverages"("costCenterId");

-- AddForeignKey
ALTER TABLE "policy_asset_coverages" ADD CONSTRAINT "policy_asset_coverages_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_asset_coverages" ADD CONSTRAINT "policy_asset_coverages_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_asset_coverages" ADD CONSTRAINT "policy_asset_coverages_insuranceTypeId_fkey" FOREIGN KEY ("insuranceTypeId") REFERENCES "insurance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_asset_coverages" ADD CONSTRAINT "policy_asset_coverages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_asset_coverages" ADD CONSTRAINT "policy_asset_coverages_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: una línea de cobertura por cada activo ya asociado a una póliza,
-- copiando el tipo de seguro/coberturas/suma asegurada que hoy vive en la
-- póliza entera — no hay forma de saber el reparto real por activo a partir
-- de datos históricos, así que cada activo arranca con el monto COMPLETO de
-- la póliza (a revisar y ajustar a mano por línea después de esta feature).
-- Pólizas sin activos (assetIds vacío — ej. Accidentes Personales) quedan
-- con una única línea sin assetId, heredando companyId/costCenterId/
-- beneficiaryDescription de la póliza.
-- ─────────────────────────────────────────────────────────────────────────────

-- Pólizas CON activos: una línea por cada elemento de assetIds.
INSERT INTO "policy_asset_coverages" (
  "id", "policyId", "assetId", "insuranceTypeId", "coverageIds",
  "insuredAmount", "currency", "exchangeRate", "insuredAmountArs", "insuredAmountUsd",
  "companyId", "costCenterId", "beneficiaryDescription", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  p."id",
  asset_id,
  p."insuranceTypeId",
  p."coverageIds",
  p."premium",
  p."currency",
  p."exchangeRate",
  p."premiumArs",
  p."premiumUsd",
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "policies" p
CROSS JOIN LATERAL unnest(p."assetIds") AS asset_id
WHERE cardinality(p."assetIds") > 0;

-- Pólizas SIN activos: una única línea "sin activo".
INSERT INTO "policy_asset_coverages" (
  "id", "policyId", "assetId", "insuranceTypeId", "coverageIds",
  "insuredAmount", "currency", "exchangeRate", "insuredAmountArs", "insuredAmountUsd",
  "companyId", "costCenterId", "beneficiaryDescription", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  p."id",
  NULL,
  p."insuranceTypeId",
  p."coverageIds",
  p."premium",
  p."currency",
  p."exchangeRate",
  p."premiumArs",
  p."premiumUsd",
  p."companyId",
  p."costCenterId",
  p."beneficiaryDescription",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "policies" p
WHERE cardinality(p."assetIds") = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Retarget policy_attachments: policyId -> policyAssetCoverageId. Un adjunto
-- histórico solo sabía de qué póliza era, nunca de qué activo — se asigna a
-- una línea de esa póliza elegida de forma arbitraria pero determinística
-- (la de menor id); si la póliza cubre más de un activo, conviene revisar y
-- reasignar el adjunto a la línea correcta a mano.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "policy_attachments" ADD COLUMN "policyAssetCoverageId" TEXT;

UPDATE "policy_attachments" pa
SET "policyAssetCoverageId" = (
  SELECT pac."id" FROM "policy_asset_coverages" pac
  WHERE pac."policyId" = pa."policyId"
  ORDER BY pac."id"
  LIMIT 1
);

ALTER TABLE "policy_attachments" ALTER COLUMN "policyAssetCoverageId" SET NOT NULL;

DROP INDEX "policy_attachments_policyId_idx";

ALTER TABLE "policy_attachments" DROP CONSTRAINT "policy_attachments_policyId_fkey";

ALTER TABLE "policy_attachments" DROP COLUMN "policyId";

CREATE INDEX "policy_attachments_policyAssetCoverageId_idx" ON "policy_attachments"("policyAssetCoverageId");

ALTER TABLE "policy_attachments" ADD CONSTRAINT "policy_attachments_policyAssetCoverageId_fkey" FOREIGN KEY ("policyAssetCoverageId") REFERENCES "policy_asset_coverages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Retarget document_policy_allocations: policyId -> policyAssetCoverageId.
-- Mismo criterio que policy_attachments — no hay forma de saber a qué activo
-- correspondía cada asignación histórica, así que se ancla a una línea de esa
-- póliza (la de menor id) como punto de partida.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "document_policy_allocations" ADD COLUMN "policyAssetCoverageId" TEXT;

UPDATE "document_policy_allocations" dpa
SET "policyAssetCoverageId" = (
  SELECT pac."id" FROM "policy_asset_coverages" pac
  WHERE pac."policyId" = dpa."policyId"
  ORDER BY pac."id"
  LIMIT 1
);

ALTER TABLE "document_policy_allocations" ALTER COLUMN "policyAssetCoverageId" SET NOT NULL;

DROP INDEX "document_policy_allocations_policyId_idx";

ALTER TABLE "document_policy_allocations" DROP CONSTRAINT "document_policy_allocations_policyId_fkey";

ALTER TABLE "document_policy_allocations" DROP COLUMN "policyId";

CREATE INDEX "document_policy_allocations_policyAssetCoverageId_idx" ON "document_policy_allocations"("policyAssetCoverageId");

ALTER TABLE "document_policy_allocations" ADD CONSTRAINT "document_policy_allocations_policyAssetCoverageId_fkey" FOREIGN KEY ("policyAssetCoverageId") REFERENCES "policy_asset_coverages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Policy: se sacan los campos que ahora viven por línea en
-- policy_asset_coverages (tipo de seguro, coberturas, imputación
-- empresa/centro de costo, suma asegurada/moneda/tipo de cambio, activos
-- asociados, y el texto de beneficiario de las líneas "sin activo").
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX "policies_companyId_idx";

DROP INDEX "policies_companyId_isActive_idx";

DROP INDEX "policies_insuranceTypeId_idx";

DROP INDEX "policies_insuranceTypeId_isActive_idx";

ALTER TABLE "policies" DROP CONSTRAINT "policies_insuranceTypeId_fkey";

ALTER TABLE "policies" DROP CONSTRAINT "policies_companyId_fkey";

ALTER TABLE "policies" DROP CONSTRAINT "policies_costCenterId_fkey";

ALTER TABLE "policies"
  DROP COLUMN "insuranceTypeId",
  DROP COLUMN "companyId",
  DROP COLUMN "costCenterId",
  DROP COLUMN "assetIds",
  DROP COLUMN "beneficiaryDescription",
  DROP COLUMN "premium",
  DROP COLUMN "currency",
  DROP COLUMN "exchangeRate",
  DROP COLUMN "premiumArs",
  DROP COLUMN "premiumUsd",
  DROP COLUMN "coverageIds";
