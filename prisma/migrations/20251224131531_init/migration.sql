-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deviceId" TEXT NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "startDate" DATETIME,
    "isWaitingFor" BOOLEAN NOT NULL DEFAULT false,
    "waitingForNote" TEXT,
    "followUpDate" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deviceId" TEXT NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fireAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'due',
    "relativeMinutes" INTEGER,
    "lastNotifiedAt" DATETIME,
    "lastNotifiedDeviceId" TEXT,
    "snoozedUntil" DATETIME,
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "repeatRule" TEXT,
    "repeatEndDate" DATETIME,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "firedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deviceId" TEXT NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Reminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NextNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reminderId" TEXT NOT NULL,
    "nextFireAt" DATETIME NOT NULL,
    "lockedUntil" DATETIME,
    "lockedByDevice" TEXT,
    "lastProcessedAt" DATETIME,
    "processCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NextNotification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,
    CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "defaultReminderTime" TEXT NOT NULL DEFAULT '09:00',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "notificationSound" BOOLEAN NOT NULL DEFAULT true,
    "notificationBadge" BOOLEAN NOT NULL DEFAULT true,
    "snoozeShort" INTEGER NOT NULL DEFAULT 10,
    "snoozeMedium" INTEGER NOT NULL DEFAULT 60,
    "snoozeLong" INTEGER NOT NULL DEFAULT 1440,
    "snoozeTomorrowTime" TEXT NOT NULL DEFAULT '09:00',
    "firebaseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" DATETIME,
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoBackupIntervalH" INTEGER NOT NULL DEFAULT 24,
    "lastBackupAt" DATETIME,
    "sidebarCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" DATETIME NOT NULL,
    "deviceId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "lastPulledAt" DATETIME,
    "lastPushedAt" DATETIME,
    "serverTimestamp" TEXT
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrentDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_isWaitingFor_idx" ON "Task"("isWaitingFor");

-- CreateIndex
CREATE INDEX "Reminder_fireAt_idx" ON "Reminder"("fireAt");

-- CreateIndex
CREATE INDEX "Reminder_taskId_idx" ON "Reminder"("taskId");

-- CreateIndex
CREATE INDEX "Reminder_snoozedUntil_idx" ON "Reminder"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NextNotification_reminderId_key" ON "NextNotification"("reminderId");

-- CreateIndex
CREATE INDEX "NextNotification_nextFireAt_idx" ON "NextNotification"("nextFireAt");

-- CreateIndex
CREATE INDEX "NextNotification_lockedUntil_idx" ON "NextNotification"("lockedUntil");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "TaskEvent_createdAt_idx" ON "TaskEvent"("createdAt");
