-- CreateTable
CREATE TABLE "user_audit_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_audit_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_audit_scopes_userId_area_idx" ON "user_audit_scopes"("userId", "area");

-- CreateIndex
CREATE INDEX "user_audit_scopes_area_scopeValue_idx" ON "user_audit_scopes"("area", "scopeValue");

-- CreateIndex
CREATE UNIQUE INDEX "user_audit_scopes_userId_area_scopeValue_key" ON "user_audit_scopes"("userId", "area", "scopeValue");

-- AddForeignKey
ALTER TABLE "user_audit_scopes" ADD CONSTRAINT "user_audit_scopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
