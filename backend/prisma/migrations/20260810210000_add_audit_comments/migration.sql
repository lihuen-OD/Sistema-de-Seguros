-- CreateTable
CREATE TABLE "audit_comments" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "auditPeriod" TEXT NOT NULL,
    "auditId" TEXT,
    "source" TEXT NOT NULL,
    "auditStatus" TEXT,
    "body" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "seenByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_comments_targetType_targetId_auditPeriod_idx" ON "audit_comments"("targetType", "targetId", "auditPeriod");

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: comentarios ya existentes (nota del auditor + decisión del
-- revisor) de las 3 auditorías, para que el feed nuevo no arranque vacío. A
-- partir de esta migración, los servicios escriben en audit_comments
-- directamente en create()/update()/review() — este backfill corre una sola
-- vez, para lo que ya existía antes de la feature.
-- ─────────────────────────────────────────────────────────────────────────────

-- Seguros — nota del auditor (con su estado de "visto" ya registrado).
INSERT INTO "audit_comments" ("id", "targetType", "targetId", "auditPeriod", "auditId", "source", "authorEmail", "body", "seenAt", "seenByEmail", "createdAt")
SELECT gen_random_uuid()::TEXT, 'ASSET', "assetId", "auditPeriod", "id", 'AUDITOR_NOTE', "auditedBy", "comments", "commentSeenAt", "commentSeenBy", "createdAt"
FROM "insurance_audits"
WHERE "comments" IS NOT NULL AND trim("comments") <> '';

-- Seguros — decisión del revisor.
INSERT INTO "audit_comments" ("id", "targetType", "targetId", "auditPeriod", "auditId", "source", "auditStatus", "authorEmail", "body", "createdAt")
SELECT gen_random_uuid()::TEXT, 'ASSET', "assetId", "auditPeriod", "id", 'REVIEW_DECISION', "status", "reviewedBy", "reviewNotes", COALESCE("reviewedAt", "updatedAt")
FROM "insurance_audits"
WHERE "reviewedBy" IS NOT NULL AND "reviewNotes" IS NOT NULL AND trim("reviewNotes") <> '';

-- Matafuegos + Rodados (misma tabla, dos poblaciones) — nota del auditor.
INSERT INTO "audit_comments" ("id", "targetType", "targetId", "auditPeriod", "auditId", "source", "authorEmail", "body", "createdAt")
SELECT gen_random_uuid()::TEXT, 'FIRE_EXTINGUISHER', "fireExtinguisherId", "auditPeriod", "id", 'AUDITOR_NOTE', "auditedBy", "comments", "createdAt"
FROM "fire_extinguisher_audits"
WHERE "comments" IS NOT NULL AND trim("comments") <> '';

-- Matafuegos + Rodados — decisión del revisor.
INSERT INTO "audit_comments" ("id", "targetType", "targetId", "auditPeriod", "auditId", "source", "auditStatus", "authorEmail", "body", "createdAt")
SELECT gen_random_uuid()::TEXT, 'FIRE_EXTINGUISHER', "fireExtinguisherId", "auditPeriod", "id", 'REVIEW_DECISION', "status", "reviewedBy", "reviewNotes", COALESCE("reviewedAt", "updatedAt")
FROM "fire_extinguisher_audits"
WHERE "reviewedBy" IS NOT NULL AND "reviewNotes" IS NOT NULL AND trim("reviewNotes") <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- InsuranceAudit: se sacan commentSeen/commentSeenAt/commentSeenBy — quedan
-- reemplazadas por AuditComment.seenAt/seenByEmail (seguimiento por
-- comentario individual, no por auditoría entera). Solo las leían
-- getComments()/markCommentSeen(), reemplazados por el servicio compartido
-- audit-comments.service.ts.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "insurance_audits" DROP COLUMN "commentSeen",
DROP COLUMN "commentSeenAt",
DROP COLUMN "commentSeenBy";
