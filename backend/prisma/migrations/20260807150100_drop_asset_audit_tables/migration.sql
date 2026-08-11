-- "Auditoría de Activos" pasa a reutilizar FireExtinguisherAudit (ver la
-- migración anterior y fire-extinguisher-audits.population.ts) en vez de su
-- propia tabla. AssetAudit/AssetAuditAttachment no tienen datos reales — solo
-- filas de prueba creadas durante la verificación en navegador de la versión
-- anterior de este módulo (auditaba la condición general del vehículo, no el
-- matafuego montado en él). DROP normal, sin necesidad de preservar datos.

DROP TABLE IF EXISTS "asset_audit_attachments";
DROP TABLE IF EXISTS "asset_audits";
