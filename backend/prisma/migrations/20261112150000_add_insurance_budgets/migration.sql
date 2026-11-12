-- Presupuestos de Seguros (Análisis → Presupuestos). Migración puramente
-- aditiva: crea 2 enums y 3 tablas vacías. No modifica ninguna tabla
-- existente, no hace backfill y no toca ninguna fila de pólizas, documentos,
-- cuotas, activos ni catálogos. Las FKs hacia catálogos/activos son RESTRICT:
-- un presupuesto (y su historial) nunca se borra en cascada.

-- CreateEnum
CREATE TYPE "InsuranceBudgetScope" AS ENUM ('COMPANY', 'COST_CENTER', 'FIXED_ASSET', 'ASSET');

-- CreateEnum
CREATE TYPE "InsuranceBudgetAuditAction" AS ENUM ('CREATE', 'UPDATE_MONTHS', 'UPDATE_NOTES');

-- CreateTable
CREATE TABLE "insurance_budgets" (
    "id" TEXT NOT NULL,
    "scopeType" "InsuranceBudgetScope" NOT NULL,
    "companyId" TEXT,
    "costCenterId" TEXT,
    "fixedAssetId" TEXT,
    "assetId" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_budget_months" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountUsd" DECIMAL(14,2) NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_budget_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_budget_audit_logs" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "action" "InsuranceBudgetAuditAction" NOT NULL,
    "month" TEXT,
    "previousAmountUsd" DECIMAL(14,2),
    "newAmountUsd" DECIMAL(14,2),
    "previousData" JSONB,
    "newData" JSONB,
    "reason" TEXT,
    "performedBy" TEXT NOT NULL,
    "versionAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_budget_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_budgets_companyId_key" ON "insurance_budgets"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_budgets_costCenterId_key" ON "insurance_budgets"("costCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_budgets_fixedAssetId_key" ON "insurance_budgets"("fixedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_budgets_assetId_key" ON "insurance_budgets"("assetId");

-- CreateIndex
CREATE INDEX "insurance_budgets_scopeType_idx" ON "insurance_budgets"("scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_budget_months_budgetId_month_key" ON "insurance_budget_months"("budgetId", "month");

-- CreateIndex
CREATE INDEX "insurance_budget_audit_logs_budgetId_createdAt_idx" ON "insurance_budget_audit_logs"("budgetId", "createdAt");

-- CreateIndex
CREATE INDEX "insurance_budget_audit_logs_budgetId_month_idx" ON "insurance_budget_audit_logs"("budgetId", "month");

-- AddForeignKey
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_budget_months" ADD CONSTRAINT "insurance_budget_months_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "insurance_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_budget_audit_logs" ADD CONSTRAINT "insurance_budget_audit_logs_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "insurance_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma no representa CHECKs en schema.prisma. Mantener estas restricciones
-- al cambiar o regenerar migraciones futuras (mismo patrón que
-- policy_renewals_not_self).

-- Exactamente un alcance no nulo, y coherente con scopeType.
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_scope_consistent"
  CHECK (
    ("scopeType" = 'COMPANY'     AND "companyId" IS NOT NULL AND "costCenterId" IS NULL AND "fixedAssetId" IS NULL AND "assetId" IS NULL) OR
    ("scopeType" = 'COST_CENTER' AND "companyId" IS NULL AND "costCenterId" IS NOT NULL AND "fixedAssetId" IS NULL AND "assetId" IS NULL) OR
    ("scopeType" = 'FIXED_ASSET' AND "companyId" IS NULL AND "costCenterId" IS NULL AND "fixedAssetId" IS NOT NULL AND "assetId" IS NULL) OR
    ("scopeType" = 'ASSET'       AND "companyId" IS NULL AND "costCenterId" IS NULL AND "fixedAssetId" IS NULL AND "assetId" IS NOT NULL)
  );

-- La versión arranca en 1 y solo crece (concurrencia optimista).
ALTER TABLE "insurance_budgets" ADD CONSTRAINT "insurance_budgets_version_positive"
  CHECK ("version" >= 1);

-- Mes calendario 'YYYY-MM' (01-12).
ALTER TABLE "insurance_budget_months" ADD CONSTRAINT "insurance_budget_months_month_format"
  CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- Un presupuesto no puede ser negativo (0 sí: presupuesto cero).
ALTER TABLE "insurance_budget_months" ADD CONSTRAINT "insurance_budget_months_amount_non_negative"
  CHECK ("amountUsd" >= 0);

-- Mismo formato de mes en el historial cuando aplica.
ALTER TABLE "insurance_budget_audit_logs" ADD CONSTRAINT "insurance_budget_audit_logs_month_format"
  CHECK ("month" IS NULL OR "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
