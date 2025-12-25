-- CreateTable
CREATE TABLE "PendingSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PendingSync_timestamp_idx" ON "PendingSync"("timestamp");

-- CreateIndex
CREATE INDEX "PendingSync_entityType_idx" ON "PendingSync"("entityType");
