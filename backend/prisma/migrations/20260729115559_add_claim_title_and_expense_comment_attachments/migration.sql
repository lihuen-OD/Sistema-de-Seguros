-- AlterTable
ALTER TABLE "claim_expenses" ADD COLUMN     "comment" TEXT;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "claim_expense_attachments" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,

    CONSTRAINT "claim_expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_expense_attachments_expenseId_idx" ON "claim_expense_attachments"("expenseId");

-- AddForeignKey
ALTER TABLE "claim_expense_attachments" ADD CONSTRAINT "claim_expense_attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "claim_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
