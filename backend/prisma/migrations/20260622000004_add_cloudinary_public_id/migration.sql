-- Add cloudinaryPublicId to attachment tables for Cloudinary file deletion support
ALTER TABLE "asset_attachments" ADD COLUMN IF NOT EXISTS "cloudinaryPublicId" TEXT;
ALTER TABLE "policy_attachments" ADD COLUMN IF NOT EXISTS "cloudinaryPublicId" TEXT;
ALTER TABLE "document_attachments" ADD COLUMN IF NOT EXISTS "cloudinaryPublicId" TEXT;
