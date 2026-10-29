BEGIN;

CREATE TABLE "fire_extinguisher_creation_requests" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "auditPeriod" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "expirationDate" DATE,
    "chargeDate" DATE,
    "hydraulicTestExpirationDate" DATE,
    "associatedAssetId" TEXT,
    "associatedAssetCode" TEXT,
    "associatedAssetName" TEXT,
    "associatedAssetType" TEXT,
    "associatedLocationType" TEXT NOT NULL,
    "location" TEXT,
    "establishment" TEXT NOT NULL,
    "brand" TEXT,
    "cylinderNumber" TEXT NOT NULL,
    "cylinderNumberNormalized" TEXT NOT NULL,
    "iramCertificateNumber" TEXT,
    "manufacturingYear" INTEGER NOT NULL,
    "observations" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdFireExtinguisherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fire_extinguisher_creation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fire_extinguisher_creation_requests_status_check" CHECK (
      ("status" = 'PENDING' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL AND "rejectionReason" IS NULL AND "createdFireExtinguisherId" IS NULL)
      OR ("status" = 'APPROVED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "rejectionReason" IS NULL AND "createdFireExtinguisherId" IS NOT NULL)
      OR ("status" = 'REJECTED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND btrim("rejectionReason") <> '' AND "createdFireExtinguisherId" IS NULL)
    ),
    CONSTRAINT "fire_extinguisher_creation_requests_period_check" CHECK ("auditPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX "fire_extinguisher_creation_requests_createdFireExtinguisherId_key"
  ON "fire_extinguisher_creation_requests"("createdFireExtinguisherId");
CREATE INDEX "fire_extinguisher_creation_requests_status_requestedAt_idx"
  ON "fire_extinguisher_creation_requests"("status", "requestedAt");
CREATE INDEX "fire_extinguisher_creation_requests_requestedBy_requestedAt_idx"
  ON "fire_extinguisher_creation_requests"("requestedBy", "requestedAt");
CREATE INDEX "fire_extinguisher_creation_requests_associatedAssetId_idx"
  ON "fire_extinguisher_creation_requests"("associatedAssetId");

-- Prisma no expresa índices parciales: solo una solicitud pendiente por
-- cilindro normalizado. Solicitudes ya decididas conservan su historial.
CREATE UNIQUE INDEX "fire_extinguisher_creation_requests_pending_cylinder_key"
  ON "fire_extinguisher_creation_requests"("cylinderNumberNormalized")
  WHERE "status" = 'PENDING';

ALTER TABLE "fire_extinguisher_creation_requests"
  ADD CONSTRAINT "fire_extinguisher_creation_requests_associatedAssetId_fkey"
  FOREIGN KEY ("associatedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fire_extinguisher_creation_requests"
  ADD CONSTRAINT "fire_extinguisher_creation_requests_createdFireExtinguisherId_fkey"
  FOREIGN KEY ("createdFireExtinguisherId") REFERENCES "fire_extinguishers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
