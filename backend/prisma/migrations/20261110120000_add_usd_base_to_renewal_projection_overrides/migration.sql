-- Base USD para las proyecciones de renovación (Financiero/Económico).
--
-- Migración EXCLUSIVAMENTE ADITIVA: solo agrega columnas nulables. No hay
-- UPDATE, DELETE ni backfill — las filas existentes quedan idénticas y sus
-- valores legados (netOverride/vatOverride/otherOverride en ARS y
-- growthPercentOverride) se conservan tal cual como histórico de solo lectura.

-- AlterTable
ALTER TABLE "asset_renewal_projection_overrides" ADD COLUMN     "netOverrideUsd" DOUBLE PRECISION,
ADD COLUMN     "vatOverrideUsd" DOUBLE PRECISION,
ADD COLUMN     "otherOverrideUsd" DOUBLE PRECISION,
ADD COLUMN     "growthPercentUsdOverride" DOUBLE PRECISION,
ADD COLUMN     "legacyConvertedRate" DOUBLE PRECISION,
ADD COLUMN     "legacyConvertedAt" TIMESTAMP(3),
ADD COLUMN     "legacyConvertedBy" TEXT;
