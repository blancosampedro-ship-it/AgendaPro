-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
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
    "avoidWeekends" BOOLEAN NOT NULL DEFAULT true,
    "avoidHolidays" BOOLEAN NOT NULL DEFAULT true,
    "workingDaysStart" INTEGER NOT NULL DEFAULT 1,
    "workingDaysEnd" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" DATETIME NOT NULL,
    "deviceId" TEXT NOT NULL
);
INSERT INTO "new_Settings" ("autoBackupEnabled", "autoBackupIntervalH", "defaultReminderTime", "deviceId", "firebaseEnabled", "id", "lastBackupAt", "lastSyncAt", "notificationBadge", "notificationSound", "sidebarCollapsed", "snoozeLong", "snoozeMedium", "snoozeShort", "snoozeTomorrowTime", "theme", "updatedAt", "weekStartsOn") SELECT "autoBackupEnabled", "autoBackupIntervalH", "defaultReminderTime", "deviceId", "firebaseEnabled", "id", "lastBackupAt", "lastSyncAt", "notificationBadge", "notificationSound", "sidebarCollapsed", "snoozeLong", "snoozeMedium", "snoozeShort", "snoozeTomorrowTime", "theme", "updatedAt", "weekStartsOn" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
