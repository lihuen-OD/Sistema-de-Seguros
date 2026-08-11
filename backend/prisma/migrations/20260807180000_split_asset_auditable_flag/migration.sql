ALTER TABLE "assets" ADD COLUMN "fireExtinguisherAuditable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assets" ADD COLUMN "insuranceAuditable" BOOLEAN NOT NULL DEFAULT false;
UPDATE "assets" SET "fireExtinguisherAuditable" = "auditable", "insuranceAuditable" = "auditable";
ALTER TABLE "assets" DROP COLUMN "auditable";
