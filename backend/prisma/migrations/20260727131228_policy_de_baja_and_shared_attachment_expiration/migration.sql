-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "policy_attachments_expirationDate_idx";

-- AlterTable
ALTER TABLE "policy_attachments" DROP COLUMN "expirationDate";
