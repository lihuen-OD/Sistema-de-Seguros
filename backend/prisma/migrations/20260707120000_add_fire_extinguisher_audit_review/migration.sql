-- Fase 4 — Revisión/aprobación de auditorías de matafuegos.
--
-- 1) Agrega trazabilidad de revisión a fire_extinguisher_audits.
-- 2) Reemplaza la unicidad TOTAL (fireExtinguisherId, auditPeriod) por un
--    índice único PARCIAL que excluye auditorías REJECTED/NEEDS_CORRECTION,
--    habilitando la "recorrección": una auditoría fallida no bloquea una
--    auditoría nueva para el mismo matafuego + período.
--
--    Prisma no soporta partial indexes en su DSL — por eso este índice NO
--    aparece como @@unique/@@index en schema.prisma. Precedente del mismo
--    escape hatch: 20260622000003_add_sequential_sequences.
--
--    El nombre del índice conserva el substring literal "auditPeriod" a
--    propósito: handleDuplicateAudit() en fire-extinguisher-audits.service.ts
--    detecta el 409 con target.includes('auditPeriod') sobre e.meta.target, y
--    Prisma no puede resolver meta.target a nombres de columna para un índice
--    que no está declarado en schema.prisma (cae al nombre crudo del índice).
--
--    ADVERTENCIA: no correr `prisma db push` sobre esta tabla; revisar a mano
--    cualquier migración futura generada por `prisma migrate dev` que toque
--    fire_extinguisher_audits, para confirmar que no elimina este índice.

-- AlterTable
ALTER TABLE "fire_extinguisher_audits"
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNotes" TEXT;

-- DropIndex (unicidad total)
DROP INDEX "fire_extinguisher_audits_fireExtinguisherId_auditPeriod_key";

-- CreateIndex (unicidad parcial — permite recorrección)
CREATE UNIQUE INDEX "fire_extinguisher_audits_fireExtinguisherId_auditPeriod_active_key"
  ON "fire_extinguisher_audits" ("fireExtinguisherId", "auditPeriod")
  WHERE "status" NOT IN ('REJECTED', 'NEEDS_CORRECTION');

-- CreateIndex (reemplazo funcional no-único, para queries por fe+período)
CREATE INDEX "fire_extinguisher_audits_fireExtinguisherId_auditPeriod_idx"
  ON "fire_extinguisher_audits" ("fireExtinguisherId", "auditPeriod");
