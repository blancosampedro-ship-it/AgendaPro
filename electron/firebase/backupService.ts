/**
 * Backup Service
 * Backups cifrados locales y en la nube
 */

import * as CryptoJS from 'crypto-js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';
import { getFirestoreDb, isFirebaseConfigured } from './config';
import { getCurrentUser, isAuthenticated } from './authService';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';

const BACKUP_VERSION = 1;
const MAX_LOCAL_BACKUPS = 10;

interface BackupData {
  version: number;
  timestamp: string;
  deviceId: string;
  tasks: any[];
  projects: any[];
  tags: any[];
  reminders: any[];
  settings: any;
}

interface BackupMetadata {
  id: string;
  timestamp: Date;
  deviceId: string;
  taskCount: number;
  projectCount: number;
  encrypted: boolean;
  location: 'local' | 'cloud';
}

/**
 * Genera una clave de cifrado basada en password + deviceId
 */
function generateKey(password: string): string {
  const deviceId = getDeviceId();
  return CryptoJS.PBKDF2(password, deviceId, {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString();
}

/**
 * Cifra datos con AES-256
 */
function encryptData(data: string, password: string): string {
  const key = generateKey(password);
  return CryptoJS.AES.encrypt(data, key).toString();
}

/**
 * Descifra datos con AES-256
 */
function decryptData(encryptedData: string, password: string): string {
  const key = generateKey(password);
  const bytes = CryptoJS.AES.decrypt(encryptedData, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Obtiene la ruta del directorio de backups
 */
function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'backups');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  return backupDir;
}

/**
 * Exporta todos los datos a un objeto BackupData
 */
async function exportData(): Promise<BackupData> {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const [tasks, projects, tags, reminders, settings] = await Promise.all([
    db.task.findMany({ include: { reminders: true } }),
    db.project.findMany(),
    db.tag.findMany(),
    db.reminder.findMany(),
    db.settings.findUnique({ where: { id: 'main' } }),
  ]);
  
  return {
    version: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    deviceId,
    tasks: tasks.map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      dueDate: t.dueDate?.toISOString(),
      startDate: t.startDate?.toISOString(),
      completedAt: t.completedAt?.toISOString(),
      deletedAt: t.deletedAt?.toISOString(),
    })),
    projects: projects.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    tags: tags.map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    reminders: reminders.map(r => ({
      ...r,
      fireAt: r.fireAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      firedAt: r.firedAt?.toISOString(),
      snoozedUntil: r.snoozedUntil?.toISOString(),
    })),
    settings: settings ? {
      ...settings,
      lastSyncAt: settings.lastSyncAt?.toISOString(),
    } : null,
  };
}

/**
 * Importa datos de un BackupData
 */
async function importData(backup: BackupData, options: { overwrite: boolean } = { overwrite: false }): Promise<void> {
  const db = getDatabase();
  
  if (options.overwrite) {
    // Eliminar todos los datos existentes
    await db.reminder.deleteMany();
    await db.task.deleteMany();
    await db.project.deleteMany();
    await db.tag.deleteMany();
  }
  
  // Importar proyectos primero (debido a relaciones)
  for (const project of backup.projects) {
    const existing = await db.project.findUnique({ where: { id: project.id } });
    if (!existing) {
      await db.project.create({
        data: {
          id: project.id,
          name: project.name,
          color: project.color || '#3B82F6',
          icon: project.icon,
          sortOrder: project.sortOrder || 0,
          isArchived: project.isArchived || false,
          createdAt: new Date(project.createdAt),
          syncVersion: project.syncVersion || 0,
          deviceId: project.deviceId || backup.deviceId,
        },
      });
    }
  }
  
  // Importar tags
  for (const tag of backup.tags) {
    const existing = await db.tag.findUnique({ where: { id: tag.id } });
    if (!existing) {
      try {
        await db.tag.create({
          data: {
            id: tag.id,
            name: tag.name,
            color: tag.color || '#6B7280',
            createdAt: new Date(tag.createdAt),
            deviceId: tag.deviceId || backup.deviceId,
          },
        });
      } catch (e) {
        // Unique constraint on name
        logger.debug(`Tag ${tag.name} already exists`);
      }
    }
  }
  
  // Importar tareas
  for (const task of backup.tasks) {
    const existing = await db.task.findUnique({ where: { id: task.id } });
    if (!existing) {
      await db.task.create({
        data: {
          id: task.id,
          title: task.title,
          notes: task.notes,
          projectId: task.projectId,
          sortOrder: task.sortOrder || 0,
          tags: task.tags || [],
          priority: task.priority || 0,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          startDate: task.startDate ? new Date(task.startDate) : null,
          isRecurring: task.isRecurring || false,
          recurrenceRule: task.recurrenceRule,
          recurrenceEnd: task.recurrenceEnd ? new Date(task.recurrenceEnd) : null,
          parentTaskId: task.parentTaskId,
          subtasks: task.subtasks,
          isWaitingFor: task.isWaitingFor || false,
          waitingForNote: task.waitingForNote,
          followUpDate: task.followUpDate ? new Date(task.followUpDate) : null,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
          deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
          createdAt: new Date(task.createdAt),
          syncVersion: task.syncVersion || 0,
          deviceId: task.deviceId || backup.deviceId,
        },
      });
    }
  }
  
  logger.info(`Imported backup: ${backup.tasks.length} tasks, ${backup.projects.length} projects, ${backup.tags.length} tags`);
}

/**
 * Crea un backup local cifrado
 */
export async function createLocalBackup(password?: string): Promise<string> {
  const backupData = await exportData();
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${timestamp}${password ? '.enc' : ''}.json`;
  const filePath = path.join(backupDir, fileName);
  
  let dataToSave: string;
  if (password) {
    dataToSave = encryptData(JSON.stringify(backupData), password);
  } else {
    dataToSave = JSON.stringify(backupData, null, 2);
  }
  
  fs.writeFileSync(filePath, dataToSave, 'utf8');
  
  // Limpiar backups antiguos
  await cleanupOldBackups();
  
  logger.info(`Local backup created: ${fileName}`);
  return filePath;
}

/**
 * Restaura un backup local
 */
export async function restoreLocalBackup(
  filePath: string, 
  password?: string,
  options: { overwrite: boolean } = { overwrite: false }
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  
  const fileContent = fs.readFileSync(filePath, 'utf8');
  let backupData: BackupData;
  
  if (password) {
    try {
      const decrypted = decryptData(fileContent, password);
      backupData = JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Invalid password or corrupted backup');
    }
  } else {
    backupData = JSON.parse(fileContent);
  }
  
  await importData(backupData, options);
  logger.info(`Backup restored from: ${filePath}`);
}

/**
 * Lista los backups locales disponibles
 */
export async function listLocalBackups(): Promise<BackupMetadata[]> {
  const backupDir = getBackupDir();
  const files = fs.readdirSync(backupDir);
  
  const backups: BackupMetadata[] = [];
  
  for (const file of files) {
    if (!file.startsWith('backup-') || !file.endsWith('.json')) continue;
    
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const encrypted = file.includes('.enc');
    
    // Intentar leer metadata sin descifrar
    let taskCount = 0;
    let projectCount = 0;
    
    if (!encrypted) {
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        taskCount = content.tasks?.length || 0;
        projectCount = content.projects?.length || 0;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    backups.push({
      id: file,
      timestamp: stats.mtime,
      deviceId: getDeviceId(),
      taskCount,
      projectCount,
      encrypted,
      location: 'local',
    });
  }
  
  return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Elimina un backup local
 */
export async function deleteLocalBackup(fileName: string): Promise<void> {
  const filePath = path.join(getBackupDir(), fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info(`Backup deleted: ${fileName}`);
  }
}

/**
 * Limpia backups antiguos, manteniendo los más recientes
 */
async function cleanupOldBackups(): Promise<void> {
  const backups = await listLocalBackups();
  
  if (backups.length > MAX_LOCAL_BACKUPS) {
    const toDelete = backups.slice(MAX_LOCAL_BACKUPS);
    for (const backup of toDelete) {
      await deleteLocalBackup(backup.id);
    }
  }
}

/**
 * Crea un backup en la nube (Firebase Storage)
 */
export async function createCloudBackup(password?: string): Promise<string> {
  if (!isFirebaseConfigured() || !isAuthenticated()) {
    throw new Error('Cloud backup not available: Firebase not configured or user not authenticated');
  }
  
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) {
    throw new Error('Firebase not initialized');
  }
  
  const backupData = await exportData();
  const backupId = `backup-${Date.now()}`;
  
  let dataToSave: string;
  if (password) {
    dataToSave = encryptData(JSON.stringify(backupData), password);
  } else {
    dataToSave = JSON.stringify(backupData);
  }
  
  // Guardar en Firestore (para backups pequeños)
  // Para backups grandes, usar Firebase Storage
  await setDoc(doc(firestore, 'users', user.uid, 'backups', backupId), {
    id: backupId,
    timestamp: Timestamp.now(),
    deviceId: getDeviceId(),
    taskCount: backupData.tasks.length,
    projectCount: backupData.projects.length,
    encrypted: !!password,
    data: dataToSave,
  });
  
  // Limpiar backups antiguos en la nube
  await cleanupOldCloudBackups();
  
  logger.info(`Cloud backup created: ${backupId}`);
  return backupId;
}

/**
 * Lista backups en la nube
 */
export async function listCloudBackups(): Promise<BackupMetadata[]> {
  if (!isFirebaseConfigured() || !isAuthenticated()) {
    return [];
  }
  
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) return [];
  
  const backupsRef = collection(firestore, 'users', user.uid, 'backups');
  const snapshot = await getDocs(backupsRef);
  
  const backups: BackupMetadata[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    backups.push({
      id: doc.id,
      timestamp: data.timestamp?.toDate() || new Date(),
      deviceId: data.deviceId,
      taskCount: data.taskCount || 0,
      projectCount: data.projectCount || 0,
      encrypted: data.encrypted || false,
      location: 'cloud',
    });
  });
  
  return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Restaura un backup de la nube
 */
export async function restoreCloudBackup(
  backupId: string,
  password?: string,
  options: { overwrite: boolean } = { overwrite: false }
): Promise<void> {
  if (!isFirebaseConfigured() || !isAuthenticated()) {
    throw new Error('Cloud restore not available');
  }
  
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) {
    throw new Error('Firebase not initialized');
  }
  
  const backupDoc = await getDoc(doc(firestore, 'users', user.uid, 'backups', backupId));
  if (!backupDoc.exists()) {
    throw new Error(`Backup not found: ${backupId}`);
  }
  
  const data = backupDoc.data();
  let backupData: BackupData;
  
  if (data.encrypted) {
    if (!password) {
      throw new Error('Password required for encrypted backup');
    }
    try {
      const decrypted = decryptData(data.data, password);
      backupData = JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Invalid password or corrupted backup');
    }
  } else {
    backupData = JSON.parse(data.data);
  }
  
  await importData(backupData, options);
  logger.info(`Cloud backup restored: ${backupId}`);
}

/**
 * Limpia backups antiguos en la nube
 */
async function cleanupOldCloudBackups(): Promise<void> {
  const backups = await listCloudBackups();
  
  if (backups.length > MAX_LOCAL_BACKUPS) {
    const firestore = getFirestoreDb();
    const user = getCurrentUser();
    if (!firestore || !user) return;
    
    const toDelete = backups.slice(MAX_LOCAL_BACKUPS);
    for (const backup of toDelete) {
      await deleteDoc(doc(firestore, 'users', user.uid, 'backups', backup.id));
    }
  }
}
