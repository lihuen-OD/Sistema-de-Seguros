-- Rediseño del checklist de Auditoría de Seguros: el checklist real
-- confirmado con el negocio es comparar la tarjeta de circulación archivada
-- en el sistema contra la que debería estar en el vehículo (hasCirculationCard),
-- no los 4 booleanos + kilometraje provisorios de la Fase 4 original.
--
-- Sin datos reales que preservar: la única fila existente en insurance_audits
-- es de la verificación en navegador de una sesión anterior (test data) — a
-- diferencia del rename de fire_extinguisher_audits.beaconPlateCondition,
-- que sí tenía auditorías reales y necesitó un RENAME COLUMN a mano, acá un
-- DROP/ADD normal es seguro.

ALTER TABLE "insurance_audits" DROP COLUMN "policyActiveConfirmed";
ALTER TABLE "insurance_audits" DROP COLUMN "insuranceCardPresent";
ALTER TABLE "insurance_audits" DROP COLUMN "dataMatchesInsuredAsset";
ALTER TABLE "insurance_audits" DROP COLUMN "physicalConditionOk";
ALTER TABLE "insurance_audits" DROP COLUMN "odometerOrHoursObserved";

ALTER TABLE "insurance_audits" ADD COLUMN "hasCirculationCard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_audits" ADD COLUMN "cardUpdateRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_audits" ADD COLUMN "cardUpdateRequestedAt" TIMESTAMP(3);
ALTER TABLE "insurance_audits" ADD COLUMN "cardUpdateRequestedBy" TEXT;
