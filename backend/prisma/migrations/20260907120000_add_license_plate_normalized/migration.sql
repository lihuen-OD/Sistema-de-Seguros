-- AlterTable
ALTER TABLE "assets" ADD COLUMN "licensePlateNormalized" TEXT;

-- Backfill: poblar licensePlateNormalized desde metadata.plate
-- Normaliza: trim, quita espacios, quita guiones, mayúsculas
UPDATE "assets"
SET "licensePlateNormalized" = UPPER(REPLACE(REPLACE(TRIM(COALESCE(metadata->>'plate', '')), ' ', ''), '-', ''))
WHERE metadata->>'plate' IS NOT NULL
  AND TRIM(metadata->>'plate') != '';

-- Índice único parcial: evita duplicados de patente normalizada.
-- Solo aplica cuando licensePlateNormalized no es NULL (activos sin patente no se ven afectados).
-- Prisma no soporta unique parciales, por eso se crea en SQL crudo.
CREATE UNIQUE INDEX "assets_licensePlateNormalized_unique"
  ON "assets" ("licensePlateNormalized")
  WHERE "licensePlateNormalized" IS NOT NULL;
