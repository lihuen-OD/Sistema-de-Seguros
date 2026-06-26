-- Add Valor Patrimonial a Nuevo field to assets
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "patrimonialValueNew" DOUBLE PRECISION;
