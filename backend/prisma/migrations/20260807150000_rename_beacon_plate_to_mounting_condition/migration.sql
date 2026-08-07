-- "Auditoría de Activos" pasa a reutilizar FireExtinguisherAudit (audita los
-- matafuegos montados en vehículos/maquinaria, no el vehículo en sí — ver
-- fire-extinguisher-audits.population.ts). El ítem de checklist que hoy se
-- llama "chapa baliza" (tiene sentido en la pared de un edificio) pasa a
-- rotularse "Soporte / Abrazadera" para esa población — mismo campo, mismos
-- 4 valores (SANA/ROTA_LEVE/ROTA_REQUIERE_CAMBIO/NO_TIENE), solo cambia el
-- rótulo en pantalla según el matafuego auditado.
--
-- Prisma no detecta renombres de columna: si se deja autogenerar este cambio
-- haría DROP COLUMN "beaconPlateCondition" + ADD COLUMN "mountingCondition",
-- perdiendo los valores ya cargados en auditorías reales (5 filas al momento
-- de escribir esto). Se reemplaza a mano por un RENAME COLUMN real, que
-- preserva los datos existentes — mismo criterio de migración hand-written
-- ya usado en este repo para índices únicos parciales (ver
-- 20260707120000_add_fire_extinguisher_audit_review).

ALTER TABLE "fire_extinguisher_audits" RENAME COLUMN "beaconPlateCondition" TO "mountingCondition";
