ALTER TABLE "asset_value_history" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'real';
