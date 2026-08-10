-- El alcance de Auditoría de Rodados (ASSET_AUDIT) y de Seguros (INSURANCE_AUDIT)
-- pasa de asignarse por categoría (scopeValue = nombre de categoría) a
-- asignarse por activo individual (scopeValue = assetId) — ver
-- fire-extinguisher-audits.population.ts#auditScopeMatchValueFor e
-- insurance-audits.service.ts. Las filas viejas nunca van a matchear un
-- assetId real, así que quedarían como "restringido a 0 activos" en vez de
-- simplemente borrarse — se borran para que el admin reasigne desde la
-- nueva pestaña "Asignación".
DELETE FROM "user_audit_scopes" WHERE "area" IN ('ASSET_AUDIT', 'INSURANCE_AUDIT');
