-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- AlterTable
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role" USING ("role"::"Role");
