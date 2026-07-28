-- AlterTable
ALTER TABLE "accounting_documents" ADD COLUMN     "totalAmountArs" DOUBLE PRECISION,
ADD COLUMN     "totalAmountUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "asset_value_history" ADD COLUMN     "valueArs" DOUBLE PRECISION,
ADD COLUMN     "valueUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "currentValueArs" DOUBLE PRECISION,
ADD COLUMN     "currentValueUsd" DOUBLE PRECISION,
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "patrimonialValueNewArs" DOUBLE PRECISION,
ADD COLUMN     "patrimonialValueNewUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "claimedAmountUsd" DOUBLE PRECISION,
ADD COLUMN     "deductibleUsd" DOUBLE PRECISION,
ADD COLUMN     "realAmountUsd" DOUBLE PRECISION,
ADD COLUMN     "settledAmountUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "document_installments" ADD COLUMN     "amountArs" DOUBLE PRECISION,
ADD COLUMN     "amountUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "premiumArs" DOUBLE PRECISION,
ADD COLUMN     "premiumUsd" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "exchange_rate_log" (
    "id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_log_createdAt_idx" ON "exchange_rate_log"("createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: cierre en ambas monedas para los datos ya existentes.
-- Todas las fórmulas usan NULLIF(exchangeRate, 0) para evitar división por
-- cero. A partir de esta migración, los servicios (policies/documents/claims/
-- assets) calculan estas columnas en cada create/update — este backfill solo
-- corre una vez, para los registros que ya existían antes de la feature.
-- ─────────────────────────────────────────────────────────────────────────────

-- Pólizas: premium ya está en la moneda indicada por currency.
UPDATE "policies" SET
  "premiumArs" = CASE WHEN "currency" = 'ARS' THEN "premium" ELSE "premium" * "exchangeRate" END,
  "premiumUsd" = CASE WHEN "currency" = 'USD' THEN "premium" ELSE "premium" / NULLIF("exchangeRate", 0) END;

-- Documentos contables: total = netAmount + vatAmount + otherTaxesAmount, ya en la moneda indicada por currency.
UPDATE "accounting_documents" SET
  "totalAmountArs" = CASE WHEN "currency" = 'ARS'
    THEN ("netAmount" + "vatAmount" + "otherTaxesAmount")
    ELSE ("netAmount" + "vatAmount" + "otherTaxesAmount") * "exchangeRate" END,
  "totalAmountUsd" = CASE WHEN "currency" = 'USD'
    THEN ("netAmount" + "vatAmount" + "otherTaxesAmount")
    ELSE ("netAmount" + "vatAmount" + "otherTaxesAmount") / NULLIF("exchangeRate", 0) END;

-- Cuotas: heredan currency/exchangeRate del documento padre (no tienen tasa propia).
UPDATE "document_installments" di SET
  "amountArs" = CASE WHEN ad."currency" = 'ARS' THEN di."amount" ELSE di."amount" * ad."exchangeRate" END,
  "amountUsd" = CASE WHEN ad."currency" = 'USD' THEN di."amount" ELSE di."amount" / NULLIF(ad."exchangeRate", 0) END
FROM "accounting_documents" ad
WHERE ad."id" = di."accountingDocumentId";

-- Siniestros: los campos "...Ars" existentes se toman tal cual (ya representan
-- pesos en la mayoría de los casos históricos — ver nota de riesgo en el plan
-- sobre la inconsistencia previa entre ClaimNewPage/ClaimEditPage). Solo se
-- calcula el equivalente en USD que faltaba.
UPDATE "claims" SET
  "claimedAmountUsd" = "claimedAmountArs" / NULLIF("exchangeRate", 0),
  "realAmountUsd" = CASE WHEN "realAmountArs" IS NULL THEN NULL ELSE "realAmountArs" / NULLIF("exchangeRate", 0) END,
  "settledAmountUsd" = CASE WHEN "settledAmountArs" IS NULL THEN NULL ELSE "settledAmountArs" / NULLIF("exchangeRate", 0) END,
  "deductibleUsd" = CASE WHEN "deductibleArs" IS NULL THEN NULL ELSE "deductibleArs" / NULLIF("exchangeRate", 0) END;

-- Activos: currentValue/patrimonialValueNew siempre fueron USD-only en la UI
-- (sin selector de moneda hasta esta feature), así que se asume currency='USD'
-- para todo el histórico. exchangeRate quedó en 1 (default de columna) — se
-- reemplaza acá por la cotización inicial sembrada más abajo, para que el
-- equivalente en ARS no quede en una escala absurda hasta que se edite cada
-- activo con una cotización real.
UPDATE "assets" SET "exchangeRate" = 1000 WHERE "exchangeRate" = 1;

UPDATE "assets" SET
  "currentValueArs" = CASE WHEN "currentValue" IS NOT NULL THEN "currentValue" * "exchangeRate" ELSE NULL END,
  "currentValueUsd" = "currentValue",
  "patrimonialValueNewArs" = CASE WHEN "patrimonialValueNew" IS NOT NULL THEN "patrimonialValueNew" * "exchangeRate" ELSE NULL END,
  "patrimonialValueNewUsd" = "patrimonialValueNew";

UPDATE "asset_value_history" ah SET
  "valueArs" = ah."value" * a."exchangeRate",
  "valueUsd" = ah."value"
FROM "assets" a
WHERE a."id" = ah."assetId";

-- Tipo de cambio global inicial — valor placeholder documentado. Un admin debe
-- actualizarlo a la cotización real desde Análisis Financiero/Económico apenas
-- se despliegue esta feature.
INSERT INTO "exchange_rate_log" ("id", "rate", "updatedBy", "createdAt")
VALUES ('a0000000-0000-4000-8000-000000000001', 1000, 'sistema (seed inicial — actualizar)', CURRENT_TIMESTAMP);
