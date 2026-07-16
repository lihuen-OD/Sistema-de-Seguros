-- CreateTable
CREATE TABLE "notification_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_dismissals_userId_idx" ON "notification_dismissals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dismissals_userId_notificationId_dueDate_key" ON "notification_dismissals"("userId", "notificationId", "dueDate");

-- AddForeignKey
ALTER TABLE "notification_dismissals" ADD CONSTRAINT "notification_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
