-- Renovación de pólizas (R1) — vínculo administrativo póliza anterior →
-- póliza nueva. Migración puramente aditiva: crea una tabla vacía, no
-- modifica ninguna tabla existente, no hace backfill y no toca ninguna fila
-- de policies, policy_asset_coverages ni documentos contables.

-- CreateTable
CREATE TABLE "policy_renewals" (
    "id" TEXT NOT NULL,
    "previousPolicyId" TEXT NOT NULL,
    "renewalPolicyId" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "policy_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_renewals_previousPolicyId_idx" ON "policy_renewals"("previousPolicyId");

-- CreateIndex
CREATE INDEX "policy_renewals_renewalPolicyId_idx" ON "policy_renewals"("renewalPolicyId");

-- Prisma no representa índices únicos parciales ni CHECKs en schema.prisma.
-- Mantener estas restricciones al cambiar o regenerar migraciones futuras
-- (mismo patrón que asset_pledges_one_active_per_asset y
-- policy_asset_coverages_one_active_per_asset).

-- Una sola renovación ACTIVA por póliza anterior. Las revertidas quedan como
-- historial y no bloquean un nuevo vínculo. Una póliza nueva sí puede
-- renovar a varias anteriores (consolidación) — por eso no hay un único
-- equivalente sobre renewalPolicyId.
CREATE UNIQUE INDEX "policy_renewals_one_active_per_previous"
  ON "policy_renewals" ("previousPolicyId")
  WHERE "revokedAt" IS NULL;

-- Una póliza no puede renovarse a sí misma.
ALTER TABLE "policy_renewals" ADD CONSTRAINT "policy_renewals_not_self"
  CHECK ("previousPolicyId" <> "renewalPolicyId");

-- Una reversión siempre registra quién la hizo y por qué.
ALTER TABLE "policy_renewals" ADD CONSTRAINT "policy_renewals_revocation_complete"
  CHECK ("revokedAt" IS NULL OR ("revokedBy" IS NOT NULL AND "revokeReason" IS NOT NULL));

-- AddForeignKey (RESTRICT preserva el historial de renovaciones ante un
-- borrado físico de cualquiera de las dos pólizas — nunca CASCADE).
ALTER TABLE "policy_renewals" ADD CONSTRAINT "policy_renewals_previousPolicyId_fkey" FOREIGN KEY ("previousPolicyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_renewals" ADD CONSTRAINT "policy_renewals_renewalPolicyId_fkey" FOREIGN KEY ("renewalPolicyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
