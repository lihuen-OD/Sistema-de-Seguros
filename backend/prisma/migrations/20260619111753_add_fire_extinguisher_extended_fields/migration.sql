/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `fire_extinguishers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "fire_extinguisher_history" ADD COLUMN     "previousExpirationDate" TEXT;

-- AlterTable
ALTER TABLE "fire_extinguishers" ADD COLUMN     "code" TEXT,
ADD COLUMN     "observations" TEXT,
ALTER COLUMN "location" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "fire_extinguishers_code_key" ON "fire_extinguishers"("code");
