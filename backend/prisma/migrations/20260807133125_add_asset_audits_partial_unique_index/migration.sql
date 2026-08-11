-- Auditoría de Activos — índice único PARCIAL sobre (assetId, auditPeriod),
-- excluyendo auditorías REJECTED/NEEDS_CORRECTION, mismo patrón que
-- fire_extinguisher_audits (ver migración
-- 20260707120000_add_fire_extinguisher_audit_review para el precedente
-- completo). Permite la "recorrección": una auditoría fallida no bloquea una
-- auditoría nueva del mismo activo+período.
--
-- Prisma no soporta partial indexes en su DSL — por eso este índice NO
-- aparece como @@unique/@@index en schema.prisma (ver el comentario en el
-- modelo AssetAudit).
--
-- El nombre del índice conserva el substring literal "auditPeriod" a
-- propósito: handleDuplicateAudit() en asset-audits.service.ts detecta el
-- 409 con target.includes('auditPeriod') sobre e.meta.target, y Prisma no
-- puede resolver meta.target a nombres de columna para un índice que no está
-- declarado en schema.prisma (cae al nombre crudo del índice).
--
-- ADVERTENCIA: no correr `prisma db push` sobre esta tabla; revisar a mano
-- cualquier migración futura generada por `prisma migrate dev` que toque
-- asset_audits, para confirmar que no elimina este índice.

CREATE UNIQUE INDEX "asset_audits_assetId_auditPeriod_active_key"
  ON "asset_audits" ("assetId", "auditPeriod")
  WHERE "status" NOT IN ('REJECTED', 'NEEDS_CORRECTION');
