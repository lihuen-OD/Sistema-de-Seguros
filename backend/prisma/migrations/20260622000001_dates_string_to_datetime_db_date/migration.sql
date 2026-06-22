-- Migration: Convert all String date fields to proper DATE type
-- Uses USING clause to cast existing text values to date without data loss

-- accounting_documents
ALTER TABLE "accounting_documents" ALTER COLUMN "issueDate" TYPE DATE USING "issueDate"::date;

-- asset_attachments
ALTER TABLE "asset_attachments" ALTER COLUMN "expirationDate" TYPE DATE USING "expirationDate"::date;

-- asset_value_history
ALTER TABLE "asset_value_history" ALTER COLUMN "date" TYPE DATE USING "date"::date;

-- assets
ALTER TABLE "assets" ALTER COLUMN "purchaseDate" TYPE DATE USING "purchaseDate"::date;

-- claim_events
ALTER TABLE "claim_events" ALTER COLUMN "date" TYPE DATE USING "date"::date;

-- claims
ALTER TABLE "claims" ALTER COLUMN "occurrenceDate" TYPE DATE USING "occurrenceDate"::date;
ALTER TABLE "claims" ALTER COLUMN "reportDate" TYPE DATE USING "reportDate"::date;

-- document_installments
ALTER TABLE "document_installments" ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::date;
ALTER TABLE "document_installments" ALTER COLUMN "paymentDate" TYPE DATE USING "paymentDate"::date;

-- fire_extinguisher_history
ALTER TABLE "fire_extinguisher_history" ALTER COLUMN "date" TYPE DATE USING "date"::date;
ALTER TABLE "fire_extinguisher_history" ALTER COLUMN "nextDueDate" TYPE DATE USING "nextDueDate"::date;
ALTER TABLE "fire_extinguisher_history" ALTER COLUMN "previousExpirationDate" TYPE DATE USING "previousExpirationDate"::date;

-- fire_extinguishers
ALTER TABLE "fire_extinguishers" ALTER COLUMN "expirationDate" TYPE DATE USING "expirationDate"::date;
ALTER TABLE "fire_extinguishers" ALTER COLUMN "lastRechargeDate" TYPE DATE USING "lastRechargeDate"::date;

-- Make fire_extinguishers.code non-nullable (set placeholder for any NULLs first)
UPDATE "fire_extinguishers" SET "code" = 'EXT-' || substring(id::text, 1, 8) WHERE "code" IS NULL;
ALTER TABLE "fire_extinguishers" ALTER COLUMN "code" SET NOT NULL;

-- policies
ALTER TABLE "policies" ALTER COLUMN "startDate" TYPE DATE USING "startDate"::date;
ALTER TABLE "policies" ALTER COLUMN "endDate" TYPE DATE USING "endDate"::date;

-- policy_attachments
ALTER TABLE "policy_attachments" ALTER COLUMN "expirationDate" TYPE DATE USING "expirationDate"::date;

-- producer_tasks
ALTER TABLE "producer_tasks" ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::date;
