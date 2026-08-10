ALTER TABLE "insurance_audits" ADD COLUMN "commentSeen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_audits" ADD COLUMN "commentSeenAt" TIMESTAMP(3);
ALTER TABLE "insurance_audits" ADD COLUMN "commentSeenBy" TEXT;
