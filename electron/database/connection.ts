/**
 * Database Connection
 * Inicializa y gestiona la conexión a SQLite via Prisma
 */

import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

let prisma: PrismaClient | null = null;

/**
 * Configura las rutas de Prisma para producción
 * Sin asar, los módulos están en Resources/app/node_modules
 */
function configurePrismaPaths(): void {
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    logger.debug(`App is packaged. Resources path: ${resourcesPath}`);
    
    // Sin asar, los archivos están en Resources/app/node_modules
    const appPath = path.join(resourcesPath, 'app');
    
    // Ruta al query engine para x64
    const x64EnginePath = path.join(
      appPath,
      'node_modules',
      '.prisma',
      'client',
      'libquery_engine-darwin.dylib.node'
    );
    
    // Ruta al query engine para ARM64
    const arm64EnginePath = path.join(
      appPath,
      'node_modules',
      '.prisma',
      'client',
      'libquery_engine-darwin-arm64.dylib.node'
    );
    
    if (fs.existsSync(arm64EnginePath)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = arm64EnginePath;
      logger.info(`Query engine configured (ARM64): ${arm64EnginePath}`);
    } else if (fs.existsSync(x64EnginePath)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = x64EnginePath;
      logger.info(`Query engine configured (x64): ${x64EnginePath}`);
    } else {
      logger.error(`Query engine not found!`);
      logger.error(`Tried ARM64: ${arm64EnginePath}`);
      logger.error(`Tried x64: ${x64EnginePath}`);
    }
  }
}

/**
 * Obtiene la ruta de la base de datos
 * SIEMPRE usar userData para que desarrollo y producción compartan datos
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'agendapro.db');
  logger.debug(`Database path: ${dbPath}`);
  return dbPath;
}

/**
 * Inicializa el esquema de la base de datos SQLite
 */
async function initializeSchema(dbPath: string): Promise<void> {
  logger.info('Initializing database schema...');
  
  // SQL para crear todas las tablas (alineado con schema.prisma actual)
  // Nota: Prisma con SQLite almacena DateTime como INTEGER (Unix timestamp en ms)
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Project" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "color" TEXT NOT NULL DEFAULT '#3B82F6',
      "icon" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isArchived" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deletedAt" INTEGER,
      "deviceId" TEXT NOT NULL,
      "syncVersion" INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS "Task" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "projectId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "tags" TEXT,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "dueDate" INTEGER,
      "startDate" INTEGER,
      "isRecurring" INTEGER NOT NULL DEFAULT 0,
      "recurrenceRule" TEXT,
      "recurrenceEnd" INTEGER,
      "parentTaskId" TEXT,
      "subtasks" TEXT,
      "isWaitingFor" INTEGER NOT NULL DEFAULT 0,
      "waitingForNote" TEXT,
      "followUpDate" INTEGER,
      "completedAt" INTEGER,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deletedAt" INTEGER,
      "deviceId" TEXT NOT NULL,
      "syncVersion" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Tag" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "color" TEXT NOT NULL DEFAULT '#6B7280',
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deviceId" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Subtask" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "completed" INTEGER NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Reminder" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "fireAt" INTEGER NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'due',
      "relativeMinutes" INTEGER,
      "lastNotifiedAt" INTEGER,
      "lastNotifiedDeviceId" TEXT,
      "snoozedUntil" INTEGER,
      "snoozeCount" INTEGER NOT NULL DEFAULT 0,
      "repeatRule" TEXT,
      "repeatEndDate" INTEGER,
      "dismissed" INTEGER NOT NULL DEFAULT 0,
      "firedAt" INTEGER,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deletedAt" INTEGER,
      "deviceId" TEXT NOT NULL,
      "syncVersion" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "NextNotification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "reminderId" TEXT NOT NULL UNIQUE,
      "nextFireAt" INTEGER NOT NULL,
      "lockedUntil" INTEGER,
      "lockedByDevice" TEXT,
      "lastProcessedAt" INTEGER,
      "processCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "TaskEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "eventData" TEXT,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deviceId" TEXT NOT NULL,
      FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Settings" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
      "defaultReminderTime" TEXT NOT NULL DEFAULT '09:00',
      "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
      "notificationSound" INTEGER NOT NULL DEFAULT 1,
      "notificationBadge" INTEGER NOT NULL DEFAULT 1,
      "snoozeShort" INTEGER NOT NULL DEFAULT 10,
      "snoozeMedium" INTEGER NOT NULL DEFAULT 60,
      "snoozeLong" INTEGER NOT NULL DEFAULT 1440,
      "snoozeTomorrowTime" TEXT NOT NULL DEFAULT '09:00',
      "firebaseEnabled" INTEGER NOT NULL DEFAULT 0,
      "lastSyncAt" INTEGER,
      "autoBackupEnabled" INTEGER NOT NULL DEFAULT 1,
      "autoBackupIntervalH" INTEGER NOT NULL DEFAULT 24,
      "lastBackupAt" INTEGER,
      "sidebarCollapsed" INTEGER NOT NULL DEFAULT 0,
      "theme" TEXT NOT NULL DEFAULT 'system',
      "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "deviceId" TEXT NOT NULL DEFAULT 'default'
    )`,
    `CREATE TABLE IF NOT EXISTS "SyncCursor" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
      "lastPulledAt" INTEGER,
      "lastPushedAt" INTEGER,
      "serverTimestamp" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Device" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "platform" TEXT NOT NULL,
      "lastSeenAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "isCurrentDevice" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS "PendingSync" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "data" TEXT,
      "timestamp" INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      "retryCount" INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate")`,
    `CREATE INDEX IF NOT EXISTS "Task_completedAt_idx" ON "Task"("completedAt")`,
    `CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "Task_isWaitingFor_idx" ON "Task"("isWaitingFor")`,
    `CREATE INDEX IF NOT EXISTS "Task_isRecurring_idx" ON "Task"("isRecurring")`,
    `CREATE INDEX IF NOT EXISTS "Task_parentTaskId_idx" ON "Task"("parentTaskId")`,
    `CREATE INDEX IF NOT EXISTS "Reminder_fireAt_idx" ON "Reminder"("fireAt")`,
    `CREATE INDEX IF NOT EXISTS "Reminder_taskId_idx" ON "Reminder"("taskId")`,
    `CREATE INDEX IF NOT EXISTS "Reminder_snoozedUntil_idx" ON "Reminder"("snoozedUntil")`,
    `CREATE INDEX IF NOT EXISTS "NextNotification_nextFireAt_idx" ON "NextNotification"("nextFireAt")`,
    `CREATE INDEX IF NOT EXISTS "NextNotification_lockedUntil_idx" ON "NextNotification"("lockedUntil")`,
    `CREATE INDEX IF NOT EXISTS "TaskEvent_taskId_idx" ON "TaskEvent"("taskId")`,
    `CREATE INDEX IF NOT EXISTS "TaskEvent_createdAt_idx" ON "TaskEvent"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "PendingSync_timestamp_idx" ON "PendingSync"("timestamp")`,
    `CREATE INDEX IF NOT EXISTS "PendingSync_entityType_idx" ON "PendingSync"("entityType")`,
  ];

  // Usar sql.js para crear el esquema
  const initSqlJs = require('sql.js');
  
  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    
    for (const sql of statements) {
      db.run(sql);
    }
    
    // Guardar la base de datos al archivo
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    
    db.close();
    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize schema:', error);
    throw error;
  }
}

/**
 * Inicializa la base de datos y Prisma client
 */
export async function initDatabase(): Promise<PrismaClient> {
  if (prisma) {
    return prisma;
  }

  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);

  // Asegurar que el directorio existe
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.debug(`Created database directory: ${dbDir}`);
  }

  // Verificar si la base de datos existe y tiene contenido
  const dbExists = fs.existsSync(dbPath);
  const dbSize = dbExists ? fs.statSync(dbPath).size : 0;
  const needsInit = !dbExists || dbSize === 0;
  
  if (needsInit) {
    logger.warn(`Database needs initialization at ${dbPath}`);
  } else {
    logger.info(`Database found: ${dbPath} (${dbSize} bytes)`);
  }

  // Configurar variable de entorno para Prisma
  process.env.DATABASE_URL = `file:${dbPath}`;

  // Configurar rutas de Prisma en producción
  configurePrismaPaths();

  // Si la base de datos está vacía, crear las tablas
  if (needsInit) {
    await initializeSchema(dbPath);
  }

  // Crear cliente Prisma
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['warn', 'error']
      : ['error'],
  });

  // Conectar
  try {
    await prisma.$connect();
    logger.info(`Database connected: ${dbPath}`);
  } catch (error: any) {
    logger.error('Failed to connect to database:', error);
    logger.error('Error message:', error?.message);
    throw error;
  }

  return prisma;
}

/**
 * Obtiene el cliente Prisma
 */
export function getDatabase(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return prisma;
}

/**
 * Cierra la conexión a la base de datos
 */
export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database connection closed');
  }
}
