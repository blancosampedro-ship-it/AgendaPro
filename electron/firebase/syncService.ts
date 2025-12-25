/**
 * Firestore Sync Service
 * Sincronización bidireccional con Firestore
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from './config';
import { getCurrentUser, isAuthenticated } from './authService';
import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';

// Tipos de documentos sincronizables
type SyncableType = 'tasks' | 'projects' | 'tags' | 'reminders';

interface SyncItem {
  id: string;
  data: any;
  updatedAt: Date;
  syncVersion: number;
  deviceId: string;
  deletedAt?: Date | null;
}

interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

/**
 * Sincroniza todos los datos con Firestore
 */
export async function syncAll(): Promise<SyncResult> {
  if (!isFirebaseConfigured() || !isAuthenticated()) {
    throw new Error('Sync not available: Firebase not configured or user not authenticated');
  }

  const result: SyncResult = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    // Sincronizar en orden de dependencias
    await syncProjects(result);
    await syncTags(result);
    await syncTasks(result);
    
    // Actualizar timestamp de última sincronización
    await updateLastSyncTime();
    
    logger.info(`Sync completed: pushed=${result.pushed}, pulled=${result.pulled}, conflicts=${result.conflicts}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    logger.error('Sync failed:', error);
  }

  return result;
}

/**
 * Sincroniza proyectos
 */
async function syncProjects(result: SyncResult): Promise<void> {
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) return;

  const localDb = getDatabase();
  const deviceId = getDeviceId();
  const collectionRef = collection(firestore, 'users', user.uid, 'projects');

  // Obtener proyectos locales modificados
  const localProjects = await localDb.project.findMany({
    where: { deletedAt: null },
  });

  // Obtener proyectos remotos
  const remoteSnapshot = await getDocs(collectionRef);
  const remoteProjects = new Map<string, any>();
  remoteSnapshot.forEach(doc => {
    remoteProjects.set(doc.id, { id: doc.id, ...doc.data() });
  });

  // Push: local -> remote
  for (const local of localProjects) {
    const remote = remoteProjects.get(local.id);
    
    if (!remote || local.syncVersion > (remote.syncVersion || 0)) {
      // Local es más reciente, subir a Firestore
      await setDoc(doc(collectionRef, local.id), {
        name: local.name,
        color: local.color,
        icon: local.icon,
        sortOrder: local.sortOrder,
        isArchived: local.isArchived,
        createdAt: Timestamp.fromDate(local.createdAt),
        updatedAt: serverTimestamp(),
        syncVersion: local.syncVersion,
        deviceId: local.deviceId,
      });
      result.pushed++;
    }
  }

  // Pull: remote -> local
  for (const [id, remote] of remoteProjects) {
    const local = await localDb.project.findUnique({ where: { id } });
    
    if (!local) {
      // No existe localmente, crear
      await localDb.project.create({
        data: {
          id: remote.id,
          name: remote.name,
          color: remote.color || '#3B82F6',
          icon: remote.icon,
          sortOrder: remote.sortOrder || 0,
          isArchived: remote.isArchived || false,
          createdAt: remote.createdAt?.toDate() || new Date(),
          syncVersion: remote.syncVersion || 0,
          deviceId: remote.deviceId || deviceId,
        },
      });
      result.pulled++;
    } else if ((remote.syncVersion || 0) > local.syncVersion) {
      // Remoto es más reciente, actualizar local
      await localDb.project.update({
        where: { id },
        data: {
          name: remote.name,
          color: remote.color,
          icon: remote.icon,
          sortOrder: remote.sortOrder,
          isArchived: remote.isArchived,
          syncVersion: remote.syncVersion,
        },
      });
      result.pulled++;
    }
  }
}

/**
 * Sincroniza etiquetas
 */
async function syncTags(result: SyncResult): Promise<void> {
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) return;

  const localDb = getDatabase();
  const deviceId = getDeviceId();
  const collectionRef = collection(firestore, 'users', user.uid, 'tags');

  // Obtener tags locales
  const localTags = await localDb.tag.findMany();

  // Obtener tags remotos
  const remoteSnapshot = await getDocs(collectionRef);
  const remoteTags = new Map<string, any>();
  remoteSnapshot.forEach(doc => {
    remoteTags.set(doc.id, { id: doc.id, ...doc.data() });
  });

  // Push: local -> remote
  for (const local of localTags) {
    if (!remoteTags.has(local.id)) {
      await setDoc(doc(collectionRef, local.id), {
        name: local.name,
        color: local.color,
        createdAt: Timestamp.fromDate(local.createdAt),
        updatedAt: serverTimestamp(),
        deviceId: local.deviceId,
      });
      result.pushed++;
    }
  }

  // Pull: remote -> local
  for (const [id, remote] of remoteTags) {
    const exists = localTags.find(t => t.id === id);
    if (!exists) {
      try {
        await localDb.tag.create({
          data: {
            id: remote.id,
            name: remote.name,
            color: remote.color || '#6B7280',
            createdAt: remote.createdAt?.toDate() || new Date(),
            deviceId: remote.deviceId || deviceId,
          },
        });
        result.pulled++;
      } catch (error) {
        // Puede fallar si el nombre ya existe (unique constraint)
        logger.debug(`Tag ${remote.name} already exists locally`);
      }
    }
  }
}

/**
 * Sincroniza tareas
 */
async function syncTasks(result: SyncResult): Promise<void> {
  const firestore = getFirestoreDb();
  const user = getCurrentUser();
  if (!firestore || !user) return;

  const localDb = getDatabase();
  const deviceId = getDeviceId();
  const collectionRef = collection(firestore, 'users', user.uid, 'tasks');

  // Obtener tareas locales (incluyendo eliminadas para sync)
  const localTasks = await localDb.task.findMany({
    include: { reminders: true },
  });

  // Obtener tareas remotas
  const remoteSnapshot = await getDocs(collectionRef);
  const remoteTasks = new Map<string, any>();
  remoteSnapshot.forEach(doc => {
    remoteTasks.set(doc.id, { id: doc.id, ...doc.data() });
  });

  // Push: local -> remote
  for (const local of localTasks) {
    const remote = remoteTasks.get(local.id);
    
    if (!remote || local.syncVersion > (remote.syncVersion || 0)) {
      await setDoc(doc(collectionRef, local.id), {
        title: local.title,
        notes: local.notes,
        projectId: local.projectId,
        sortOrder: local.sortOrder,
        tags: local.tags,
        priority: local.priority,
        dueDate: local.dueDate ? Timestamp.fromDate(local.dueDate) : null,
        startDate: local.startDate ? Timestamp.fromDate(local.startDate) : null,
        isRecurring: local.isRecurring,
        recurrenceRule: local.recurrenceRule,
        recurrenceEnd: local.recurrenceEnd ? Timestamp.fromDate(local.recurrenceEnd) : null,
        subtasks: local.subtasks,
        isWaitingFor: local.isWaitingFor,
        waitingForNote: local.waitingForNote,
        followUpDate: local.followUpDate ? Timestamp.fromDate(local.followUpDate) : null,
        completedAt: local.completedAt ? Timestamp.fromDate(local.completedAt) : null,
        deletedAt: local.deletedAt ? Timestamp.fromDate(local.deletedAt) : null,
        createdAt: Timestamp.fromDate(local.createdAt),
        updatedAt: serverTimestamp(),
        syncVersion: local.syncVersion,
        deviceId: local.deviceId,
      });
      result.pushed++;
    }
  }

  // Pull: remote -> local
  for (const [id, remote] of remoteTasks) {
    const local = await localDb.task.findUnique({ where: { id } });
    
    if (!local) {
      // No existe localmente, crear
      await localDb.task.create({
        data: {
          id: remote.id,
          title: remote.title,
          notes: remote.notes,
          projectId: remote.projectId,
          sortOrder: remote.sortOrder || 0,
          tags: remote.tags,
          priority: remote.priority || 0,
          dueDate: remote.dueDate?.toDate(),
          startDate: remote.startDate?.toDate(),
          isRecurring: remote.isRecurring || false,
          recurrenceRule: remote.recurrenceRule,
          recurrenceEnd: remote.recurrenceEnd?.toDate(),
          subtasks: remote.subtasks,
          isWaitingFor: remote.isWaitingFor || false,
          waitingForNote: remote.waitingForNote,
          followUpDate: remote.followUpDate?.toDate(),
          completedAt: remote.completedAt?.toDate(),
          deletedAt: remote.deletedAt?.toDate(),
          createdAt: remote.createdAt?.toDate() || new Date(),
          syncVersion: remote.syncVersion || 0,
          deviceId: remote.deviceId || deviceId,
        },
      });
      result.pulled++;
    } else if ((remote.syncVersion || 0) > local.syncVersion) {
      // Remoto es más reciente, actualizar local
      await localDb.task.update({
        where: { id },
        data: {
          title: remote.title,
          notes: remote.notes,
          projectId: remote.projectId,
          sortOrder: remote.sortOrder,
          tags: remote.tags,
          priority: remote.priority,
          dueDate: remote.dueDate?.toDate(),
          isRecurring: remote.isRecurring,
          recurrenceRule: remote.recurrenceRule,
          subtasks: remote.subtasks,
          isWaitingFor: remote.isWaitingFor,
          waitingForNote: remote.waitingForNote,
          completedAt: remote.completedAt?.toDate(),
          deletedAt: remote.deletedAt?.toDate(),
          syncVersion: remote.syncVersion,
        },
      });
      result.pulled++;
    } else if ((remote.syncVersion || 0) === local.syncVersion && 
               remote.deviceId !== local.deviceId) {
      // Mismo version pero diferente dispositivo = conflicto
      result.conflicts++;
      // Estrategia: el más reciente gana
      const remoteTime = remote.updatedAt?.toDate()?.getTime() || 0;
      const localTime = local.updatedAt.getTime();
      
      if (remoteTime > localTime) {
        await localDb.task.update({
          where: { id },
          data: {
            title: remote.title,
            notes: remote.notes,
            syncVersion: { increment: 1 },
          },
        });
      }
    }
  }
}

/**
 * Actualiza el timestamp de última sincronización
 */
async function updateLastSyncTime(): Promise<void> {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Usar upsert para crear el registro si no existe
  await db.settings.upsert({
    where: { id: 'main' },
    create: {
      id: 'main',
      deviceId,
      lastSyncAt: new Date(),
    },
    update: { 
      lastSyncAt: new Date() 
    },
  });
  
  await db.syncCursor.upsert({
    where: { id: 'main' },
    create: {
      id: 'main',
      lastPulledAt: new Date(),
      lastPushedAt: new Date(),
    },
    update: {
      lastPulledAt: new Date(),
      lastPushedAt: new Date(),
    },
  });
}

/**
 * Obtiene el estado de sincronización
 */
export async function getSyncStatus(): Promise<{
  enabled: boolean;
  lastSyncAt: Date | null;
  pendingChanges: number;
}> {
  const db = getDatabase();
  const settings = await db.settings.findUnique({ where: { id: 'main' } });
  
  // Contar cambios pendientes (items con syncVersion > lastSync)
  const pendingTasks = await db.task.count({
    where: {
      updatedAt: {
        gt: settings?.lastSyncAt || new Date(0),
      },
    },
  });
  
  return {
    enabled: settings?.firebaseEnabled || false,
    lastSyncAt: settings?.lastSyncAt || null,
    pendingChanges: pendingTasks,
  };
}

/**
 * Fuerza push de todos los datos locales
 */
export async function forcePush(): Promise<SyncResult> {
  // Incrementar syncVersion de todos los items para forzar push
  const db = getDatabase();
  
  await db.task.updateMany({
    data: { syncVersion: { increment: 1 } },
  });
  
  await db.project.updateMany({
    data: { syncVersion: { increment: 1 } },
  });
  
  return syncAll();
}

/**
 * Fuerza pull de todos los datos remotos
 */
export async function forcePull(): Promise<SyncResult> {
  // Resetear syncVersion local para forzar pull
  const db = getDatabase();
  
  await db.task.updateMany({
    data: { syncVersion: 0 },
  });
  
  await db.project.updateMany({
    data: { syncVersion: 0 },
  });
  
  return syncAll();
}
