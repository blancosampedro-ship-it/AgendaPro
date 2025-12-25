-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deviceId" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "startDate" DATETIME,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "recurrenceEnd" DATETIME,
    "parentTaskId" TEXT,
    "assignedToId" TEXT,
    "subtasks" TEXT,
    "isWaitingFor" BOOLEAN NOT NULL DEFAULT false,
    "waitingForNote" TEXT,
    "followUpDate" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deviceId" TEXT NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("completedAt", "createdAt", "deletedAt", "deviceId", "dueDate", "followUpDate", "id", "isRecurring", "isWaitingFor", "notes", "parentTaskId", "priority", "projectId", "recurrenceEnd", "recurrenceRule", "sortOrder", "startDate", "subtasks", "syncVersion", "tags", "title", "updatedAt", "waitingForNote") SELECT "completedAt", "createdAt", "deletedAt", "deviceId", "dueDate", "followUpDate", "id", "isRecurring", "isWaitingFor", "notes", "parentTaskId", "priority", "projectId", "recurrenceEnd", "recurrenceRule", "sortOrder", "startDate", "subtasks", "syncVersion", "tags", "title", "updatedAt", "waitingForNote" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_isWaitingFor_idx" ON "Task"("isWaitingFor");
CREATE INDEX "Task_isRecurring_idx" ON "Task"("isRecurring");
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
