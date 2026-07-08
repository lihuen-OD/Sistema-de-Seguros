-- Simplifica el checklist de auditoría de matafuegos: se sacan campos sin uso
-- real (obstrucción, presión, "la chapa coincide con el tipo", traba de
-- seguridad, observados de prueba hidráulica/cilindro/capacidad/agente/marca,
-- y la nota general `observations` que el frontend nunca enviaba). Se fusiona
-- "¿tiene chapa baliza?" + "estado de la chapa" en un solo campo
-- (beaconPlateCondition), agregando NO_TIENE como valor válido.

-- Backfill defensivo antes de exigir NOT NULL (no se esperan filas reales con
-- este campo en null a esta altura).
UPDATE "fire_extinguisher_audits" SET "beaconPlateCondition" = 'NO_TIENE' WHERE "beaconPlateCondition" IS NULL;

-- AlterTable
ALTER TABLE "fire_extinguisher_audits"
  DROP COLUMN "beaconPlateExists",
  DROP COLUMN "beaconPlateMatchesType",
  DROP COLUMN "isObstructed",
  DROP COLUMN "pressureStatus",
  DROP COLUMN "safetyPinStatus",
  DROP COLUMN "hydraulicTestExpirationDateObserved",
  DROP COLUMN "cylinderNumberObserved",
  DROP COLUMN "capacityObserved",
  DROP COLUMN "extinguishingAgentObserved",
  DROP COLUMN "brandObserved",
  DROP COLUMN "observations",
  ALTER COLUMN "beaconPlateCondition" SET NOT NULL;
