-- Elimina "Número interno" de Matafuegos: reemplazado por "Número de cilindro"
-- (cylinderNumber), que ya cumple el mismo rol de identificador secundario.

-- DropIndex
DROP INDEX "fire_extinguishers_internalNumber_key";

-- AlterTable
ALTER TABLE "fire_extinguishers" DROP COLUMN "internalNumber";
