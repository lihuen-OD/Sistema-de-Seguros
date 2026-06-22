-- Performance indexes for the most frequently filtered columns

-- policies: dashboard KPIs and expiration queries filter by isActive + endDate
CREATE INDEX IF NOT EXISTS "policies_isActive_endDate_idx" ON "policies" ("isActive", "endDate");

-- document_installments: dashboard and notifications filter by paymentStatus + dueDate
CREATE INDEX IF NOT EXISTS "document_installments_paymentStatus_dueDate_idx" ON "document_installments" ("paymentStatus", "dueDate");

-- fire_extinguishers: dashboard KPIs and notifications filter by isActive + expirationDate
CREATE INDEX IF NOT EXISTS "fire_extinguishers_isActive_expirationDate_idx" ON "fire_extinguishers" ("isActive", "expirationDate");
