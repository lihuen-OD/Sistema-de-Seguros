-- CreateTable
CREATE TABLE "asset_audits" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "auditDate" DATE NOT NULL,
    "auditPeriod" TEXT NOT NULL,
    "auditedBy" TEXT NOT NULL,
    "generalCondition" TEXT NOT NULL,
    "documentationOnBoard" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audit_attachments" (
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

    CONSTRAINT "asset_audit_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_audits_assetId_auditPeriod_idx" ON "asset_audits"("assetId", "auditPeriod");

-- CreateIndex
CREATE INDEX "asset_audits_assetId_idx" ON "asset_audits"("assetId");

-- CreateIndex
CREATE INDEX "asset_audit_attachments_auditId_idx" ON "asset_audit_attachments"("auditId");

-- AddForeignKey
ALTER TABLE "asset_audits" ADD CONSTRAINT "asset_audits_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audit_attachments" ADD CONSTRAINT "asset_audit_attachments_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "asset_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
