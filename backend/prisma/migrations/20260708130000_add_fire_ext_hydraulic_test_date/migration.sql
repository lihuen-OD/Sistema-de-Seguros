-- Agrega el vencimiento de prueba hidráulica al maestro de matafuegos.
-- Cierra el círculo con FireExtinguisherAudit.hydraulicTestExpirationDateObserved,
-- que hasta ahora no tenía contraparte en el maestro.

-- AlterTable
ALTER TABLE "fire_extinguishers" ADD COLUMN "hydraulicTestExpirationDate" DATE;
