-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('pdf', 'image', 'excel', 'word', 'video', 'other');

-- AlterTable
ALTER TABLE "asset_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "insurance_audit_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "policy_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "document_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "fire_extinguisher_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "claim_expense_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
ALTER TABLE "claim_attachments" ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::"FileType");
