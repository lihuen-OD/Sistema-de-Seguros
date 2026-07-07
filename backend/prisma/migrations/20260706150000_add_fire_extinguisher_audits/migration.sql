-- Matafuegos Fase 3: Auditoría mensual.
-- Puramente aditivo — 3 tablas nuevas, no se modifica ninguna tabla existente.
--
-- Reversible manualmente con:
--   DROP TABLE "fire_extinguisher_attachments";
--   DROP TABLE "fire_extinguisher_audit_proposed_changes";
--   DROP TABLE "fire_extinguisher_audits";

-- CreateTable
CREATE TABLE "fire_extinguisher_audits" (
    "id" TEXT NOT NULL,
    "fireExtinguisherId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "auditDate" DATE NOT NULL,
    "auditPeriod" TEXT NOT NULL,
    "auditedBy" TEXT NOT NULL,
    "locationConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "locationChangeRequested" BOOLEAN NOT NULL DEFAULT false,
    "proposedLocation" TEXT,
    "locationChangeReason" TEXT,
    "cleanliness" TEXT NOT NULL,
    "chargeFillStatus" TEXT NOT NULL,
    "beaconPlateExists" TEXT NOT NULL,
    "beaconPlateCondition" TEXT,
    "beaconPlateMatchesType" TEXT,
    "isObstructed" TEXT NOT NULL,
    "pressureStatus" TEXT NOT NULL,
    "sealStatus" TEXT NOT NULL,
    "ringStatus" TEXT NOT NULL,
    "safetyPinStatus" TEXT NOT NULL,
    "hoseNozzleCondition" TEXT NOT NULL,
    "chargeExpirationDateObserved" DATE,
    "hydraulicTestExpirationDateObserved" DATE,
    "cylinderNumberObserved" TEXT,
    "capacityObserved" TEXT,
    "extinguishingAgentObserved" TEXT,
    "brandObserved" TEXT,
    "comments" TEXT,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fire_extinguisher_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fire_extinguisher_audit_proposed_changes" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "fireExtinguisherId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "currentValue" TEXT NOT NULL,
    "proposedValue" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fire_extinguisher_audit_proposed_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fire_extinguisher_attachments" (
    "id" TEXT NOT NULL,
    "fireExtinguisherId" TEXT NOT NULL,
    "auditId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,

    CONSTRAINT "fire_extinguisher_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fire_extinguisher_audits_fireExtinguisherId_idx" ON "fire_extinguisher_audits"("fireExtinguisherId");

-- CreateIndex
CREATE UNIQUE INDEX "fire_extinguisher_audits_fireExtinguisherId_auditPeriod_key" ON "fire_extinguisher_audits"("fireExtinguisherId", "auditPeriod");

-- CreateIndex
CREATE INDEX "fire_extinguisher_audit_proposed_changes_auditId_idx" ON "fire_extinguisher_audit_proposed_changes"("auditId");

-- CreateIndex
CREATE INDEX "fire_extinguisher_audit_proposed_changes_fireExtinguisherId_idx" ON "fire_extinguisher_audit_proposed_changes"("fireExtinguisherId");

-- CreateIndex
CREATE INDEX "fire_extinguisher_attachments_fireExtinguisherId_idx" ON "fire_extinguisher_attachments"("fireExtinguisherId");

-- CreateIndex
CREATE INDEX "fire_extinguisher_attachments_auditId_idx" ON "fire_extinguisher_attachments"("auditId");

-- AddForeignKey
ALTER TABLE "fire_extinguisher_audits" ADD CONSTRAINT "fire_extinguisher_audits_fireExtinguisherId_fkey" FOREIGN KEY ("fireExtinguisherId") REFERENCES "fire_extinguishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_extinguisher_audit_proposed_changes" ADD CONSTRAINT "fire_extinguisher_audit_proposed_changes_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "fire_extinguisher_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_extinguisher_audit_proposed_changes" ADD CONSTRAINT "fire_extinguisher_audit_proposed_changes_fireExtinguisherI_fkey" FOREIGN KEY ("fireExtinguisherId") REFERENCES "fire_extinguishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_extinguisher_attachments" ADD CONSTRAINT "fire_extinguisher_attachments_fireExtinguisherId_fkey" FOREIGN KEY ("fireExtinguisherId") REFERENCES "fire_extinguishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_extinguisher_attachments" ADD CONSTRAINT "fire_extinguisher_attachments_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "fire_extinguisher_audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
