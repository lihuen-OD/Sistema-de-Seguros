-- Simplifica Bienes de Uso: pasa de ficha contable (categoría, vida útil,
-- amortización, valores) a catálogo simple igual a Centros de Costo
-- (nombre, código opcional, descripción opcional, estado).
--
-- Escrita a mano en vez de generada por `prisma migrate dev` porque la tabla
-- ya tiene filas reales y "name" es NOT NULL sin default — Prisma no puede
-- resolver ese diff de forma no interactiva (mismo motivo que las migraciones
-- de secuencias/índices parciales anteriores).

-- 1. Agregar "name" nullable primero, para poder rellenarla desde datos existentes.
ALTER TABLE "fixed_assets" ADD COLUMN "name" TEXT;

-- 2. La vieja "description" era en realidad el nombre/etiqueta del bien
--    (ej. "Camión semirremolque tractor — Transporte de cereales I") — se
--    convierte en el nuevo "name".
UPDATE "fixed_assets" SET "name" = "description" WHERE "name" IS NULL;

-- 3. Ahora sí, requerida.
ALTER TABLE "fixed_assets" ALTER COLUMN "name" SET NOT NULL;

-- 4. "description" pasa a ser un campo opcional y libre (como en Centros de
--    Costo) — se vacía porque su contenido ya se movió a "name". Primero hay
--    que sacar el NOT NULL, si no la propia UPDATE a NULL lo viola.
ALTER TABLE "fixed_assets" ALTER COLUMN "description" DROP NOT NULL;
UPDATE "fixed_assets" SET "description" = NULL;

-- 5. "code" pasa a ser opcional (se autogenera si no se especifica, igual
--    que cost_centers) — se mantienen los códigos ya cargados.
ALTER TABLE "fixed_assets" ALTER COLUMN "code" DROP NOT NULL;

-- 6. Se eliminan las columnas contables que ya no aplican.
ALTER TABLE "fixed_assets" DROP COLUMN "category";
ALTER TABLE "fixed_assets" DROP COLUMN "incorporationDate";
ALTER TABLE "fixed_assets" DROP COLUMN "usefulLifeYears";
ALTER TABLE "fixed_assets" DROP COLUMN "depreciationRate";
ALTER TABLE "fixed_assets" DROP COLUMN "originalValueArs";
ALTER TABLE "fixed_assets" DROP COLUMN "bookValueArs";

-- 7. Secuencia para autogenerar código cuando no se especifica, mismo patrón
--    que cost_center_code_seq (20260625141200_add_asset_costcenter_sequences).
CREATE SEQUENCE IF NOT EXISTS fixed_asset_code_seq MINVALUE 1 START 1;

DO $$
DECLARE
  fa_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fa_count FROM fixed_assets;
  IF fa_count > 0 THEN
    PERFORM setval('fixed_asset_code_seq', fa_count);
  END IF;
END $$;
