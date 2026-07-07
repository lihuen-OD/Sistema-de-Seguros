-- Matafuegos Fase 1: limpieza y base del maestro
--
-- Reversible manualmente con:
--   ALTER TABLE "fire_extinguishers" RENAME COLUMN "cylinderNumber" TO "serialNumber";
--   DROP INDEX "fire_extinguishers_internalNumber_key";
--   ALTER TABLE "fire_extinguishers" DROP COLUMN "internalNumber", DROP COLUMN "manufacturingYear", DROP COLUMN "establishment";
--
-- IMPORTANTE: "serialNumber" -> "cylinderNumber" es un RENAME, no un drop+add.
-- Prisma's diff engine no detecta renombres automáticamente y generaría
-- DROP COLUMN "serialNumber" + ADD COLUMN "cylinderNumber", perdiendo los datos
-- existentes. Este archivo fue editado a mano para evitar esa pérdida de datos.

-- AlterTable
ALTER TABLE "fire_extinguishers"
  ADD COLUMN "internalNumber" TEXT,
  ADD COLUMN "manufacturingYear" INTEGER,
  ADD COLUMN "establishment" TEXT;

ALTER TABLE "fire_extinguishers" RENAME COLUMN "serialNumber" TO "cylinderNumber";

-- CreateIndex
CREATE UNIQUE INDEX "fire_extinguishers_internalNumber_key" ON "fire_extinguishers"("internalNumber");
