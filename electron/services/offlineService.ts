/**
 * OfflineService - Gestión mejorada de modo offline
 * Fase 6: Cola de cambios, detección de conexión, auto-sync
 */

import { net, BrowserWindow } from 'electron';
import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';

interface PendingChange {
  id: string;
  entityType: 'task' | 'project' | 'tag' | 'reminder' | 'subtask';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data?: any;
  timestamp: Date;
  retryCount: number;
}

let isOnline = true;
let pendingChanges: PendingChange[] = [];
let mainWindow: BrowserWindow | null = null;
let checkInterval: NodeJS.Timeout | null = null;
let syncInProgress = false;

const MAX_RETRIES = 3;
const CHECK_INTERVAL_MS = 30000; // 30 segundos
const PING_URL = 'https://www.google.com/generate_204';

/**
 * Inicializar servicio offline
 */
export function initOfflineService(window: BrowserWindow): void {
  mainWindow = window;
  
  // Verificar estado inicial
  checkOnlineStatus();
  
  // Cargar cambios pendientes de DB
  loadPendingChanges();
  
  // Iniciar verificación periódica
  checkInterval = setInterval(checkOnlineStatus, CHECK_INTERVAL_MS);
  
  logger.info('Servicio offline inicializado');
}

/**
 * Detener servicio offline
 */
export function stopOfflineService(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Verificar estado de conexión
 */
async function checkOnlineStatus(): Promise<void> {
  const wasOnline = isOnline;
  
  try {
    // Usar net.isOnline() de Electron
    const electronOnline = net.isOnline();
    
    if (electronOnline) {
      // Verificar con ping real
      isOnline = await pingServer();
    } else {
      isOnline = false;
    }
  } catch {
    isOnline = false;
  }
  
  // Si cambió el estado, notificar
  if (wasOnline !== isOnline) {
    logger.info(`Estado de conexión cambió: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    notifyConnectionChange();
    
    // Si volvimos online, intentar sincronizar
    if (isOnline && pendingChanges.length > 0) {
      await processPendingChanges();
    }
  }
}

/**
 * Ping real al servidor
 */
async function pingServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'HEAD',
      url: PING_URL,
    });
    
    const timeout = setTimeout(() => {
      request.abort();
      resolve(false);
    }, 5000);
    
    request.on('response', () => {
      clearTimeout(timeout);
      resolve(true);
    });
    
    request.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    
    request.end();
  });
}

/**
 * Cargar cambios pendientes de la base de datos
 */
async function loadPendingChanges(): Promise<void> {
  try {
    const db = getDatabase();
    
    // Verificar si existe la tabla de cambios pendientes
    const changes = await db.pendingSync?.findMany({
      orderBy: { timestamp: 'asc' },
    }).catch(() => []);
    
    if (changes && changes.length > 0) {
      pendingChanges = changes.map(c => ({
        id: c.id,
        entityType: c.entityType as any,
        entityId: c.entityId,
        action: c.action as any,
        data: c.data ? JSON.parse(c.data as string) : undefined,
        timestamp: c.timestamp,
        retryCount: c.retryCount || 0,
      }));
      logger.info(`${pendingChanges.length} cambios pendientes cargados`);
    }
  } catch (error) {
    // La tabla puede no existir todavía
    logger.debug('No hay cambios pendientes o tabla no existe');
  }
}

/**
 * Guardar cambio pendiente
 */
export async function queueChange(change: Omit<PendingChange, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
  const newChange: PendingChange = {
    ...change,
    id: crypto.randomUUID(),
    timestamp: new Date(),
    retryCount: 0,
  };
  
  pendingChanges.push(newChange);
  
  // Persistir en DB
  try {
    const db = getDatabase();
    await db.pendingSync?.create({
      data: {
        id: newChange.id,
        entityType: newChange.entityType,
        entityId: newChange.entityId,
        action: newChange.action,
        data: newChange.data ? JSON.stringify(newChange.data) : null,
        timestamp: newChange.timestamp,
        retryCount: 0,
      },
    }).catch(() => {
      // Tabla puede no existir
    });
  } catch {
    // Ignorar si la tabla no existe
  }
  
  // Notificar UI
  notifyPendingChangesUpdate();
  
  // Si estamos online, procesar inmediatamente
  if (isOnline && !syncInProgress) {
    processPendingChanges();
  }
}

/**
 * Procesar cambios pendientes
 */
async function processPendingChanges(): Promise<void> {
  if (syncInProgress || pendingChanges.length === 0) {
    return;
  }
  
  syncInProgress = true;
  logger.info(`Procesando ${pendingChanges.length} cambios pendientes...`);
  
  const processed: string[] = [];
  const failed: string[] = [];
  
  for (const change of [...pendingChanges]) {
    try {
      // Aquí iría la lógica de sincronización real con Firebase
      // Por ahora solo simulamos el proceso
      const success = await syncChange(change);
      
      if (success) {
        processed.push(change.id);
        // Eliminar de la cola
        pendingChanges = pendingChanges.filter(c => c.id !== change.id);
        
        // Eliminar de DB
        const db = getDatabase();
        await db.pendingSync?.delete({ where: { id: change.id } }).catch(() => {});
      } else {
        change.retryCount++;
        if (change.retryCount >= MAX_RETRIES) {
          failed.push(change.id);
          pendingChanges = pendingChanges.filter(c => c.id !== change.id);
        }
      }
    } catch (error) {
      logger.error(`Error procesando cambio ${change.id}:`, error);
      change.retryCount++;
    }
  }
  
  syncInProgress = false;
  
  if (processed.length > 0) {
    logger.info(`${processed.length} cambios sincronizados`);
  }
  if (failed.length > 0) {
    logger.warn(`${failed.length} cambios fallaron después de ${MAX_RETRIES} intentos`);
  }
  
  notifyPendingChangesUpdate();
}

/**
 * Sincronizar un cambio individual (placeholder)
 */
async function syncChange(change: PendingChange): Promise<boolean> {
  // Esta función será conectada con el servicio de sync de Firebase
  // Por ahora retorna true para simular éxito
  return true;
}

/**
 * Obtener estado de conexión
 */
export function getOnlineStatus(): boolean {
  return isOnline;
}

/**
 * Obtener número de cambios pendientes
 */
export function getPendingChangesCount(): number {
  return pendingChanges.length;
}

/**
 * Obtener información completa del estado offline
 */
export function getOfflineInfo(): {
  isOnline: boolean;
  pendingChanges: number;
  lastCheck: Date;
} {
  return {
    isOnline,
    pendingChanges: pendingChanges.length,
    lastCheck: new Date(),
  };
}

/**
 * Forzar verificación de conexión
 */
export async function forceConnectionCheck(): Promise<boolean> {
  await checkOnlineStatus();
  return isOnline;
}

/**
 * Forzar sincronización de cambios pendientes
 */
export async function forceSyncPendingChanges(): Promise<{
  processed: number;
  remaining: number;
}> {
  const before = pendingChanges.length;
  await processPendingChanges();
  return {
    processed: before - pendingChanges.length,
    remaining: pendingChanges.length,
  };
}

/**
 * Notificar cambio de conexión al renderer
 */
function notifyConnectionChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('connection:changed', {
      isOnline,
      pendingChanges: pendingChanges.length,
    });
  }
}

/**
 * Notificar actualización de cambios pendientes
 */
function notifyPendingChangesUpdate(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pending-changes:updated', {
      count: pendingChanges.length,
    });
  }
}

/**
 * Limpiar todos los cambios pendientes (usar con cuidado)
 */
export async function clearPendingChanges(): Promise<void> {
  pendingChanges = [];
  
  try {
    const db = getDatabase();
    await db.pendingSync?.deleteMany({}).catch(() => {});
  } catch {
    // Ignorar
  }
  
  notifyPendingChangesUpdate();
  logger.info('Cambios pendientes limpiados');
}
