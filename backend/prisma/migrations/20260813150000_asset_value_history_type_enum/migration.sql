-- Corrige el residuo del seed viejo (visto en demo: 4 filas 'compra' + 3
-- 'revaluo', producción ya está limpia) antes de que la columna deje de
-- aceptar cualquier string libre.
UPDATE "asset_value_history" SET "type" = 'real' WHERE "type" IN ('compra', 'revaluo');

-- CreateEnum
CREATE TYPE "AssetValueHistoryType" AS ENUM ('real', 'nuevo');

-- AlterTable
ALTER TABLE "asset_value_history"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "AssetValueHistoryType" USING ("type"::"AssetValueHistoryType"),
  ALTER COLUMN "type" SET DEFAULT 'real';
