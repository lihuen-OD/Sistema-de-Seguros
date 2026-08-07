-- CreateTable
CREATE TABLE "insurance_audits" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "auditDate" DATE NOT NULL,
    "auditPeriod" TEXT NOT NULL,
    "auditedBy" TEXT NOT NULL,
    "policyActiveConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "insuranceCardPresent" BOOLEAN NOT NULL DEFAULT false,
    "dataMatchesInsuredAsset" BOOLEAN NOT NULL DEFAULT false,
    "physicalConditionOk" BOOLEAN NOT NULL DEFAULT false,
    "odometerOrHoursObserved" TEXT,
    "comments" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_audit_attachments" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,

    CONSTRAINT "insurance_audit_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurance_audits_assetId_auditPeriod_idx" ON "insurance_audits"("assetId", "auditPeriod");

-- CreateIndex
CREATE INDEX "insurance_audits_assetId_idx" ON "insurance_audits"("assetId");

-- CreateIndex
CREATE INDEX "insurance_audit_attachments_auditId_idx" ON "insurance_audit_attachments"("auditId");

-- AddForeignKey
ALTER TABLE "insurance_audits" ADD CONSTRAINT "insurance_audits_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_audit_attachments" ADD CONSTRAINT "insurance_audit_attachments_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "insurance_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
