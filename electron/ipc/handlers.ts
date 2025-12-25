/**
 * IPC Handlers
 * Manejadores de comunicación Main <-> Renderer
 * 
 * ARQUITECTURA LOCAL-FIRST:
 * - SQLite (Prisma) es la fuente PRINCIPAL de datos
 * - Firestore sincroniza en background cuando hay conexión
 * - La app funciona siempre, con o sin internet
 */

import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { getMainWindow, hideMainWindow } from '../windows/mainWindow';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';
import { reschedule } from '../scheduler/dueDateScheduler';

// LOCAL SERVICE (fuente principal - siempre disponible)
import * as taskService from '../services/taskService';
import * as reminderService from '../services/reminderService';

// Auth service (para verificar si podemos sincronizar)
import { isAuthenticated, getCurrentUser } from '../firebase/authService';

// Variable para controlar sincronización en background
let syncInProgress = false;

/**
 * Sincroniza con Firestore en background (no bloquea)
 */
async function syncToFirestoreBackground(): Promise<void> {
  if (syncInProgress) return;
  if (!isAuthenticated()) return;
  
  syncInProgress = true;
  try {
    // Importación dinámica para evitar errores si Firebase no está configurado
    const { syncAll } = await import('../firebase/syncService');
    await syncAll();
    logger.debug('Background sync completed');
  } catch (error) {
    logger.debug('Background sync failed (will retry later):', error);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Registra todos los handlers IPC
 */
export function setupIpcHandlers(): void {
  logger.debug('Setting up IPC handlers...');

  // ═══════════════════════════════════════════════════════════════════════
  // WINDOW HANDLERS
  // ═══════════════════════════════════════════════════════════════════════
  
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    const win = getMainWindow();
    win?.minimize();
    logger.debug('Window minimized');
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
    logger.debug('Window maximize toggled');
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    hideMainWindow();
    logger.debug('Window close requested -> hidden');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // APP HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    logger.info('Quit requested from renderer');
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_DEVICE_ID, () => {
    return getDeviceId();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TASK HANDLERS - LOCAL-FIRST (lee/escribe a SQLite, sincroniza en background)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle(IPC_CHANNELS.TASK_GET_ALL, async () => {
    try {
      const tasks = await taskService.getAllTasks();
      logger.debug(`TASK_GET_ALL: returned ${tasks.length} tasks from local DB`);
      // Sync en background (no bloquea)
      syncToFirestoreBackground();
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_ALL error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-today', async () => {
    try {
      const tasks = await taskService.getTodayTasks();
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_TODAY error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-overdue', async () => {
    try {
      const tasks = await taskService.getOverdueTasks();
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_OVERDUE error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-upcoming', async () => {
    try {
      const tasks = await taskService.getUpcomingTasks();
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_UPCOMING error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-waiting', async () => {
    try {
      const tasks = await taskService.getWaitingTasks();
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_WAITING error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, async (_event, taskData) => {
    try {
      logger.debug('Creating task (local-first):', taskData);
      const task = await taskService.createTask(taskData);
      reschedule();
      // Sync en background
      syncToFirestoreBackground();
      return task;
    } catch (error) {
      logger.error('TASK_CREATE error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, async (_event, id, data) => {
    try {
      const task = await taskService.updateTask(id, data);
      reschedule();
      // Sync en background
      syncToFirestoreBackground();
      return task;
    } catch (error) {
      logger.error('TASK_UPDATE error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_DELETE, async (_event, id) => {
    try {
      const task = await taskService.deleteTask(id);
      reschedule();
      // Sync en background
      syncToFirestoreBackground();
      return task;
    } catch (error) {
      logger.error('TASK_DELETE error:', error);
      throw error;
    }
  });

  // Obtener tarea por ID
  ipcMain.handle('task:get-by-id', async (_event, id) => {
    try {
      const task = await taskService.getTaskById(id);
      return task;
    } catch (error) {
      logger.error('task:get-by-id error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_COMPLETE, async (_event, id) => {
    try {
      // Verificar si es tarea recurrente
      const task = await taskService.getTaskById(id);
      let result;
      if (task?.isRecurring) {
        result = await taskService.completeRecurringTask(id);
      } else {
        result = await taskService.completeTask(id);
      }
      reschedule();
      // Sync en background
      syncToFirestoreBackground();
      return result;
    } catch (error) {
      logger.error('TASK_COMPLETE error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:reopen', async (_event, id) => {
    try {
      const task = await taskService.reopenTask(id);
      reschedule();
      // Sync en background
      syncToFirestoreBackground();
      return task;
    } catch (error) {
      logger.error('TASK_REOPEN error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SUBTAREAS (Fase 4) - LOCAL-FIRST
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('subtask:toggle', async (_event, taskId: string, subtaskId: string, done: boolean) => {
    try {
      const result = await taskService.updateSubtask(taskId, subtaskId, done);
      syncToFirestoreBackground();
      return result;
    } catch (error) {
      logger.error('SUBTASK_TOGGLE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ETIQUETAS / TAGS (Fase 4) - LOCAL-FIRST
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('tag:get-all', async () => {
    try {
      const tags = await taskService.getAllTags();
      return tags;
    } catch (error) {
      logger.error('TAG_GET_ALL error:', error);
      throw error;
    }
  });

  ipcMain.handle('tag:create', async (_event, name: string, color?: string) => {
    try {
      const tag = await taskService.createTag(name, color);
      syncToFirestoreBackground();
      return tag;
    } catch (error) {
      logger.error('TAG_CREATE error:', error);
      throw error;
    }
  });

  ipcMain.handle('tag:delete', async (_event, id: string) => {
    try {
      const result = await taskService.deleteTag(id);
      syncToFirestoreBackground();
      return result;
    } catch (error) {
      logger.error('TAG_DELETE error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-by-tag', async (_event, tagName: string) => {
    try {
      const tasks = await taskService.getTasksByTag(tagName);
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_BY_TAG error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // BÚSQUEDA DE TAREAS (Fase 3) - LOCAL-FIRST
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('task:search', async (_event, query: string) => {
    try {
      const tasks = await taskService.searchTasks(query);
      return tasks;
    } catch (error) {
      logger.error('TASK_SEARCH error:', error);
      throw error;
    }
  });

  ipcMain.handle('task:get-by-project', async (_event, projectId: string | null) => {
    try {
      const tasks = await taskService.getTasksByProject(projectId);
      return tasks;
    } catch (error) {
      logger.error('TASK_GET_BY_PROJECT error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PROJECT HANDLERS (Fase 3) - LOCAL-FIRST
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('project:get-all', async () => {
    try {
      const projects = await taskService.getAllProjects();
      return projects;
    } catch (error) {
      logger.error('PROJECT_GET_ALL error:', error);
      throw error;
    }
  });

  ipcMain.handle('project:create', async (_event, data) => {
    try {
      const project = await taskService.createProject(data);
      syncToFirestoreBackground();
      return project;
    } catch (error) {
      logger.error('PROJECT_CREATE error:', error);
      throw error;
    }
  });

  ipcMain.handle('project:update', async (_event, id: string, data) => {
    try {
      const project = await taskService.updateProject(id, data);
      syncToFirestoreBackground();
      return project;
    } catch (error) {
      logger.error('PROJECT_UPDATE error:', error);
      throw error;
    }
  });

  ipcMain.handle('project:archive', async (_event, id: string) => {
    try {
      const project = await taskService.archiveProject(id);
      syncToFirestoreBackground();
      return project;
    } catch (error) {
      logger.error('PROJECT_ARCHIVE error:', error);
      throw error;
    }
  });

  ipcMain.handle('project:delete', async (_event, id: string) => {
    try {
      const result = await taskService.deleteProject(id);
      syncToFirestoreBackground();
      return result;
    } catch (error) {
      logger.error('PROJECT_DELETE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // REMINDER HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle(IPC_CHANNELS.REMINDER_SNOOZE, async (_event, id, option) => {
    try {
      const reminder = await reminderService.snoozeReminder(id, option);
      reschedule();
      return reminder;
    } catch (error) {
      logger.error('REMINDER_SNOOZE error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REMINDER_DISMISS, async (_event, id) => {
    try {
      await reminderService.dismissReminder(id);
      reschedule();
      return { success: true };
    } catch (error) {
      logger.error('REMINDER_DISMISS error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REMINDER_CREATE, async (_event, data) => {
    try {
      const reminder = await reminderService.createReminder(data);
      reschedule();
      return reminder;
    } catch (error) {
      logger.error('REMINDER_CREATE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      const { getDatabase } = await import('../database/connection');
      const db = getDatabase();
      let settings = await db.settings.findUnique({ where: { id: 'main' } });
      
      if (!settings) {
        // Crear settings por defecto
        settings = await db.settings.create({
          data: {
            id: 'main',
            deviceId: getDeviceId(),
          },
        });
      }
      
      return settings;
    } catch (error) {
      logger.error('SETTINGS_GET error:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, data) => {
    try {
      const { getDatabase } = await import('../database/connection');
      const db = getDatabase();
      return await db.settings.update({
        where: { id: 'main' },
        data,
      });
    } catch (error) {
      logger.error('SETTINGS_UPDATE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FIREBASE / SYNC HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('firebase:is-configured', async () => {
    try {
      const { isFirebaseConfigured } = await import('../firebase/config');
      return isFirebaseConfigured();
    } catch (error) {
      logger.error('FIREBASE_IS_CONFIGURED error:', error);
      return false;
    }
  });

  ipcMain.handle('firebase:get-config-status', async () => {
    try {
      const { isFirebaseConfigured, initializeFirebase } = await import('../firebase/config');
      const configured = isFirebaseConfigured();
      let initialized = false;
      
      if (configured) {
        const app = initializeFirebase();
        initialized = !!app;
      }
      
      return { configured, initialized };
    } catch (error) {
      logger.error('FIREBASE_GET_CONFIG_STATUS error:', error);
      return { configured: false, initialized: false };
    }
  });

  // Auth handlers - Email/Password
  ipcMain.handle('auth:sign-up', async (_event, email: string, password: string, displayName?: string) => {
    try {
      const { signUp } = await import('../firebase/authService');
      return await signUp(email, password, displayName);
    } catch (error) {
      logger.error('AUTH_SIGN_UP error:', error);
      throw error;
    }
  });

  ipcMain.handle('auth:sign-in', async (_event, email: string, password: string) => {
    try {
      const { signIn } = await import('../firebase/authService');
      return await signIn(email, password);
    } catch (error) {
      logger.error('AUTH_SIGN_IN error:', error);
      throw error;
    }
  });

  ipcMain.handle('auth:reset-password', async (_event, email: string) => {
    try {
      const { resetPassword } = await import('../firebase/authService');
      await resetPassword(email);
      return { success: true };
    } catch (error) {
      logger.error('AUTH_RESET_PASSWORD error:', error);
      throw error;
    }
  });

  ipcMain.handle('auth:sign-out', async () => {
    try {
      const { signOut } = await import('../firebase/authService');
      await signOut();
      return { success: true };
    } catch (error) {
      logger.error('AUTH_SIGN_OUT error:', error);
      throw error;
    }
  });

  ipcMain.handle('auth:get-current-user', async () => {
    try {
      const { getCurrentUser } = await import('../firebase/authService');
      return getCurrentUser();
    } catch (error) {
      logger.error('AUTH_GET_CURRENT_USER error:', error);
      return null;
    }
  });

  ipcMain.handle('auth:is-authenticated', async () => {
    try {
      const { isAuthenticated } = await import('../firebase/authService');
      return isAuthenticated();
    } catch (error) {
      logger.error('AUTH_IS_AUTHENTICATED error:', error);
      return false;
    }
  });

  ipcMain.handle('auth:restore-session', async () => {
    try {
      const { restoreSession } = await import('../firebase/authService');
      return await restoreSession();
    } catch (error) {
      logger.error('AUTH_RESTORE_SESSION error:', error);
      return null;
    }
  });

  // Sync handlers
  ipcMain.handle('sync:sync-all', async () => {
    try {
      const { syncAll } = await import('../firebase/syncService');
      return await syncAll();
    } catch (error) {
      logger.error('SYNC_ALL error:', error);
      throw error;
    }
  });

  ipcMain.handle('sync:get-status', async () => {
    try {
      const { getSyncStatus } = await import('../firebase/syncService');
      return await getSyncStatus();
    } catch (error) {
      logger.error('SYNC_GET_STATUS error:', error);
      throw error;
    }
  });

  ipcMain.handle('sync:force-push', async () => {
    try {
      const { forcePush } = await import('../firebase/syncService');
      return await forcePush();
    } catch (error) {
      logger.error('SYNC_FORCE_PUSH error:', error);
      throw error;
    }
  });

  ipcMain.handle('sync:force-pull', async () => {
    try {
      const { forcePull } = await import('../firebase/syncService');
      return await forcePull();
    } catch (error) {
      logger.error('SYNC_FORCE_PULL error:', error);
      throw error;
    }
  });

  // Backup handlers
  ipcMain.handle('backup:create-local', async (_event, password?: string) => {
    try {
      const { createLocalBackup } = await import('../firebase/backupService');
      return await createLocalBackup(password);
    } catch (error) {
      logger.error('BACKUP_CREATE_LOCAL error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:restore-local', async (_event, filePath: string, password?: string, overwrite?: boolean) => {
    try {
      const { restoreLocalBackup } = await import('../firebase/backupService');
      await restoreLocalBackup(filePath, password, { overwrite: overwrite || false });
      return { success: true };
    } catch (error) {
      logger.error('BACKUP_RESTORE_LOCAL error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:list-local', async () => {
    try {
      const { listLocalBackups } = await import('../firebase/backupService');
      return await listLocalBackups();
    } catch (error) {
      logger.error('BACKUP_LIST_LOCAL error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:delete-local', async (_event, fileName: string) => {
    try {
      const { deleteLocalBackup } = await import('../firebase/backupService');
      await deleteLocalBackup(fileName);
      return { success: true };
    } catch (error) {
      logger.error('BACKUP_DELETE_LOCAL error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:create-cloud', async (_event, password?: string) => {
    try {
      const { createCloudBackup } = await import('../firebase/backupService');
      return await createCloudBackup(password);
    } catch (error) {
      logger.error('BACKUP_CREATE_CLOUD error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:list-cloud', async () => {
    try {
      const { listCloudBackups } = await import('../firebase/backupService');
      return await listCloudBackups();
    } catch (error) {
      logger.error('BACKUP_LIST_CLOUD error:', error);
      throw error;
    }
  });

  ipcMain.handle('backup:restore-cloud', async (_event, backupId: string, password?: string, overwrite?: boolean) => {
    try {
      const { restoreCloudBackup } = await import('../firebase/backupService');
      await restoreCloudBackup(backupId, password, { overwrite: overwrite || false });
      return { success: true };
    } catch (error) {
      logger.error('BACKUP_RESTORE_CLOUD error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT/IMPORT HANDLERS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('export:to-json', async (_event, options?: { includeCompleted?: boolean; projectIds?: string[] }) => {
    try {
      const { exportToJSON } = await import('../services/exportService');
      return await exportToJSON(options);
    } catch (error) {
      logger.error('EXPORT_TO_JSON error:', error);
      throw error;
    }
  });

  ipcMain.handle('import:from-json', async (_event, options?: { merge?: boolean }) => {
    try {
      const { importFromJSON } = await import('../services/exportService');
      return await importFromJSON(options);
    } catch (error) {
      logger.error('IMPORT_FROM_JSON error:', error);
      throw error;
    }
  });

  ipcMain.handle('export:get-stats', async () => {
    try {
      const { getDataStats } = await import('../services/exportService');
      return await getDataStats();
    } catch (error) {
      logger.error('EXPORT_GET_STATS error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // THEME HANDLERS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('theme:get', async () => {
    try {
      const { getThemeInfo } = await import('../services/themeService');
      return getThemeInfo();
    } catch (error) {
      logger.error('THEME_GET error:', error);
      throw error;
    }
  });

  ipcMain.handle('theme:set', async (_event, mode: 'light' | 'dark' | 'system') => {
    try {
      const { setTheme } = await import('../services/themeService');
      await setTheme(mode);
      return { success: true, mode };
    } catch (error) {
      logger.error('THEME_SET error:', error);
      throw error;
    }
  });

  ipcMain.handle('theme:cycle', async () => {
    try {
      const { cycleTheme } = await import('../services/themeService');
      const newMode = await cycleTheme();
      return { success: true, mode: newMode };
    } catch (error) {
      logger.error('THEME_CYCLE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // OFFLINE STATUS HANDLERS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('offline:get-status', async () => {
    try {
      const { getOfflineInfo } = await import('../services/offlineService');
      return getOfflineInfo();
    } catch (error) {
      logger.error('OFFLINE_GET_STATUS error:', error);
      return { isOnline: true, pendingChanges: 0, lastCheck: new Date() };
    }
  });

  ipcMain.handle('offline:check-connection', async () => {
    try {
      const { forceConnectionCheck } = await import('../services/offlineService');
      return await forceConnectionCheck();
    } catch (error) {
      logger.error('OFFLINE_CHECK_CONNECTION error:', error);
      return false;
    }
  });

  ipcMain.handle('offline:sync-pending', async () => {
    try {
      const { forceSyncPendingChanges } = await import('../services/offlineService');
      return await forceSyncPendingChanges();
    } catch (error) {
      logger.error('OFFLINE_SYNC_PENDING error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLOBAL SHORTCUTS HANDLERS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('shortcuts:get-all', async () => {
    try {
      const { getRegisteredShortcuts, getDefaultShortcuts } = await import('../shortcuts/globalShortcuts');
      return {
        registered: getRegisteredShortcuts(),
        defaults: getDefaultShortcuts(),
      };
    } catch (error) {
      logger.error('SHORTCUTS_GET_ALL error:', error);
      return { registered: [], defaults: [] };
    }
  });

  ipcMain.handle('shortcuts:toggle', async (_event, accelerator: string, enabled: boolean) => {
    try {
      const { toggleShortcut } = await import('../shortcuts/globalShortcuts');
      const success = toggleShortcut(accelerator, enabled);
      return { success };
    } catch (error) {
      logger.error('SHORTCUTS_TOGGLE error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // APPLE REMINDERS IMPORT
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('apple-reminders:import', async (_event, options?: { includeCompleted?: boolean }) => {
    try {
      const { importAppleReminders } = await import('../services/appleRemindersService');
      const result = await importAppleReminders(options);
      reschedule(); // Actualizar scheduler con nuevas tareas
      syncToFirestoreBackground();
      return result;
    } catch (error) {
      logger.error('APPLE_REMINDERS_IMPORT error:', error);
      throw error;
    }
  });

  ipcMain.handle('apple-reminders:count', async () => {
    try {
      const { countAppleReminders } = await import('../services/appleRemindersService');
      return await countAppleReminders();
    } catch (error) {
      logger.error('APPLE_REMINDERS_COUNT error:', error);
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // REMINDER POPUP HANDLERS
  // ═══════════════════════════════════════════════════════════════════════
  
  // Configurar handlers del popup de recordatorios
  import('../windows/reminderPopup').then(({ setupReminderPopupHandlers }) => {
    setupReminderPopupHandlers();
    logger.debug('Reminder popup handlers registered');
  }).catch(error => {
    logger.error('Failed to setup reminder popup handlers:', error);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // OVERDUE POPUP API
  // ═══════════════════════════════════════════════════════════════════════
  
  ipcMain.handle('overdue-popup:restore', async () => {
    try {
      const { restoreOverduePopup } = await import('../windows/overduePopup');
      restoreOverduePopup();
      return { success: true };
    } catch (error) {
      logger.error('OVERDUE_POPUP_RESTORE error:', error);
      throw error;
    }
  });

  ipcMain.handle('overdue-popup:refresh', async () => {
    try {
      const { refreshOverduePopup } = await import('../windows/overduePopup');
      await refreshOverduePopup();
      return { success: true };
    } catch (error) {
      logger.error('OVERDUE_POPUP_REFRESH error:', error);
      throw error;
    }
  });

  ipcMain.handle('overdue-popup:is-open', async () => {
    try {
      const { isOverduePopupOpen } = await import('../windows/overduePopup');
      return isOverduePopupOpen();
    } catch (error) {
      logger.error('OVERDUE_POPUP_IS_OPEN error:', error);
      return false;
    }
  });

  logger.debug('All IPC handlers registered');
}
