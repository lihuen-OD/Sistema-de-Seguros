-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accessProfileId" TEXT;

-- CreateTable
CREATE TABLE "access_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modules" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_profiles_name_key" ON "access_profiles"("name");

-- CreateIndex
CREATE INDEX "users_accessProfileId_idx" ON "users"("accessProfileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_accessProfileId_fkey" FOREIGN KEY ("accessProfileId") REFERENCES "access_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
