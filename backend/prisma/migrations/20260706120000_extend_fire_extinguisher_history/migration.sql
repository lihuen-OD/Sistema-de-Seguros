-- Matafuegos Fase 2: historial ampliado a más eventos (alta/edición/baja),
-- no solo recarga. Columnas nuevas, nullable, sin afectar filas existentes.
--
-- Reversible manualmente con:
--   ALTER TABLE "fire_extinguisher_history" DROP COLUMN "description", DROP COLUMN "previousData", DROP COLUMN "newData";

-- AlterTable
ALTER TABLE "fire_extinguisher_history"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "newData" JSONB,
  ADD COLUMN "previousData" JSONB;
