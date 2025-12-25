/**
 * Preload Script - Bridge seguro entre Main y Renderer
 * 
 * ⚠️ SEGURIDAD:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - Solo exponemos APIs específicas via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/channels';

console.log('[Preload] Script loading...');

/**
 * API expuesta al Renderer (window.electronAPI)
 * Solo métodos seguros y específicos
 */
const electronAPI = {
  // ═══════════════════════════════════════════════════════════════════════
  // WINDOW
  // ═══════════════════════════════════════════════════════════════════════
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // APP
  // ═══════════════════════════════════════════════════════════════════════
  app: {
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    getDeviceId: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_DEVICE_ID),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TASKS
  // ═══════════════════════════════════════════════════════════════════════
  getAllTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_ALL),
  getTask: (id: string) => ipcRenderer.invoke('task:get-by-id', id),
  getTodayTasks: () => ipcRenderer.invoke('task:get-today'),
  getOverdueTasks: () => ipcRenderer.invoke('task:get-overdue'),
  getUpcomingTasks: (days?: number) => ipcRenderer.invoke('task:get-upcoming', days),
  getWaitingTasks: () => ipcRenderer.invoke('task:get-waiting'),
  searchTasks: (query: string) => ipcRenderer.invoke('task:search', query),
  getTasksByProject: (projectId: string | null) => ipcRenderer.invoke('task:get-by-project', projectId),
  createTask: (task: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, task),
  updateTask: (id: string, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, id, data),
  deleteTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, id),
  completeTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_COMPLETE, id),
  reopenTask: (id: string) => ipcRenderer.invoke('task:reopen', id),

  // ═══════════════════════════════════════════════════════════════════════
  // PROJECTS (Fase 3)
  // ═══════════════════════════════════════════════════════════════════════
  getAllProjects: () => ipcRenderer.invoke('project:get-all'),
  createProject: (data: unknown) => ipcRenderer.invoke('project:create', data),
  updateProject: (id: string, data: unknown) => ipcRenderer.invoke('project:update', id, data),
  archiveProject: (id: string) => ipcRenderer.invoke('project:archive', id),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),

  // ═══════════════════════════════════════════════════════════════════════
  // SUBTAREAS (Fase 4)
  // ═══════════════════════════════════════════════════════════════════════
  toggleSubtask: (taskId: string, subtaskId: string, done: boolean) => 
    ipcRenderer.invoke('subtask:toggle', taskId, subtaskId, done),

  // ═══════════════════════════════════════════════════════════════════════
  // ETIQUETAS / TAGS (Fase 4)
  // ═══════════════════════════════════════════════════════════════════════
  getAllTags: () => ipcRenderer.invoke('tag:get-all'),
  createTag: (name: string, color?: string) => ipcRenderer.invoke('tag:create', name, color),
  deleteTag: (id: string) => ipcRenderer.invoke('tag:delete', id),
  getTasksByTag: (tagName: string) => ipcRenderer.invoke('task:get-by-tag', tagName),

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEDULE ANALYZER - Análisis de conflictos y carga
  // ═══════════════════════════════════════════════════════════════════════
  schedule: {
    analyze: (proposedDate: string, excludeTaskId?: string) => 
      ipcRenderer.invoke('schedule:analyze', proposedDate, excludeTaskId),
    checkConflicts: (proposedDate: string, excludeTaskId?: string) => 
      ipcRenderer.invoke('schedule:check-conflicts', proposedDate, excludeTaskId),
    getWeekAnalysis: (startDate?: string) => 
      ipcRenderer.invoke('schedule:week-analysis', startDate),
    detectAllConflicts: () => 
      ipcRenderer.invoke('schedule:detect-all-conflicts'),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REMINDERS
  // ═══════════════════════════════════════════════════════════════════════
  createReminder: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.REMINDER_CREATE, data),
  snoozeReminder: (id: string, option: unknown) => ipcRenderer.invoke(IPC_CHANNELS.REMINDER_SNOOZE, id, option),
  dismissReminder: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REMINDER_DISMISS, id),
  
  // API de recordatorios múltiples con antelación
  reminders: {
    getForTask: (taskId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.REMINDER_GET_FOR_TASK, taskId),
    updateForTask: (taskId: string, eventDate: string, advanceMinutesList: number[]) => 
      ipcRenderer.invoke(IPC_CHANNELS.REMINDER_UPDATE_FOR_TASK, taskId, eventDate, advanceMinutesList),
    getOptions: () => 
      ipcRenderer.invoke(IPC_CHANNELS.REMINDER_GET_OPTIONS),
    getDefaults: (commitmentType: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.REMINDER_GET_DEFAULTS, commitmentType),
  },

  // Acción del popup de recordatorio (desde ventana de recordatorio)
  reminderAction: (action: string, taskId: string, reminderId: string, minutes?: number) => 
    ipcRenderer.invoke('reminder:action', action, taskId, reminderId, minutes),

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FIREBASE / SYNC (Fase 5)
  // ═══════════════════════════════════════════════════════════════════════
  firebase: {
    isConfigured: () => ipcRenderer.invoke('firebase:is-configured'),
    getConfigStatus: () => ipcRenderer.invoke('firebase:get-config-status'),
  },

  auth: {
    signUp: (email: string, password: string, displayName?: string) => 
      ipcRenderer.invoke('auth:sign-up', email, password, displayName),
    signIn: (email: string, password: string) => 
      ipcRenderer.invoke('auth:sign-in', email, password),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    resetPassword: (email: string) => ipcRenderer.invoke('auth:reset-password', email),
    getCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    restoreSession: () => ipcRenderer.invoke('auth:restore-session'),
  },

  sync: {
    syncAll: () => ipcRenderer.invoke('sync:sync-all'),
    getStatus: () => ipcRenderer.invoke('sync:get-status'),
    forcePush: () => ipcRenderer.invoke('sync:force-push'),
    forcePull: () => ipcRenderer.invoke('sync:force-pull'),
  },

  backup: {
    createLocal: (password?: string) => ipcRenderer.invoke('backup:create-local', password),
    restoreLocal: (filePath: string, password?: string, overwrite?: boolean) => 
      ipcRenderer.invoke('backup:restore-local', filePath, password, overwrite),
    listLocal: () => ipcRenderer.invoke('backup:list-local'),
    deleteLocal: (fileName: string) => ipcRenderer.invoke('backup:delete-local', fileName),
    createCloud: (password?: string) => ipcRenderer.invoke('backup:create-cloud', password),
    listCloud: () => ipcRenderer.invoke('backup:list-cloud'),
    restoreCloud: (backupId: string, password?: string, overwrite?: boolean) => 
      ipcRenderer.invoke('backup:restore-cloud', backupId, password, overwrite),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AI ASSISTANT - Integración con OpenAI
  // ═══════════════════════════════════════════════════════════════════════
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:get-config'),
    saveConfig: (config: { apiKey?: string; model?: string; enabled?: boolean }) => 
      ipcRenderer.invoke('ai:save-config', config),
    validateKey: (apiKey: string) => ipcRenderer.invoke('ai:validate-key', apiKey),
    chat: (message: string, context?: any) => ipcRenderer.invoke('ai:chat', message, context),
    suggestTime: (taskTitle: string, existingTasks: any[]) => 
      ipcRenderer.invoke('ai:suggest-time', taskTitle, existingTasks),
    generateSubtasks: (taskTitle: string, taskNotes?: string) => 
      ipcRenderer.invoke('ai:generate-subtasks', taskTitle, taskNotes),
    prioritize: (tasks: any[]) => ipcRenderer.invoke('ai:prioritize', tasks),
    isAvailable: () => ipcRenderer.invoke('ai:is-available'),
    // Asistente de creación de tareas (Hybrid)
    parseTaskBasic: (input: string) => ipcRenderer.invoke('ai:parse-task-basic', input),
    parseTaskDeep: (input: string, options?: { generateSubtasks?: boolean }) => 
      ipcRenderer.invoke('ai:parse-task-deep', input, options),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CONTACTOS / EQUIPO
  // ═══════════════════════════════════════════════════════════════════════
  contacts: {
    getAll: () => ipcRenderer.invoke('contact:get-all'),
    create: (data: { name: string; email?: string; color?: string }) => 
      ipcRenderer.invoke('contact:create', data),
    update: (id: string, data: { name?: string; email?: string; color?: string }) => 
      ipcRenderer.invoke('contact:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('contact:delete', id),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ATTACHMENTS - Archivos, URLs y Emails
  // ═══════════════════════════════════════════════════════════════════════
  attachments: {
    getAll: (taskId: string) => ipcRenderer.invoke('attachment:get-all', taskId),
    addFile: (data: { taskId: string; filePath: string; name?: string }) => 
      ipcRenderer.invoke('attachment:add-file', data),
    addUrl: (data: { taskId: string; url: string; name?: string }) => 
      ipcRenderer.invoke('attachment:add-url', data),
    addEmail: (data: { taskId: string; url: string; name?: string; metadata?: { from?: string; subject?: string; date?: string } }) => 
      ipcRenderer.invoke('attachment:add-email', data),
    addEml: (data: { taskId: string; filePath: string; name?: string }) => 
      ipcRenderer.invoke('attachment:add-eml', data),
    delete: (id: string) => ipcRenderer.invoke('attachment:delete', id),
    open: (id: string) => ipcRenderer.invoke('attachment:open', id),
    getContent: (id: string) => ipcRenderer.invoke('attachment:get-content', id),
    selectFile: () => ipcRenderer.invoke('attachment:select-file'),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════
  export: {
    toJSON: (options?: { includeCompleted?: boolean; projectIds?: string[] }) => 
      ipcRenderer.invoke('export:to-json', options),
    getStats: () => ipcRenderer.invoke('export:get-stats'),
  },

  import: {
    fromJSON: (options?: { merge?: boolean }) => 
      ipcRenderer.invoke('import:from-json', options),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // THEMES (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (mode: 'light' | 'dark' | 'system') => ipcRenderer.invoke('theme:set', mode),
    cycle: () => ipcRenderer.invoke('theme:cycle'),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OFFLINE STATUS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════
  offline: {
    getStatus: () => ipcRenderer.invoke('offline:get-status'),
    checkConnection: () => ipcRenderer.invoke('offline:check-connection'),
    syncPending: () => ipcRenderer.invoke('offline:sync-pending'),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GLOBAL SHORTCUTS (Fase 6)
  // ═══════════════════════════════════════════════════════════════════════
  shortcuts: {
    getAll: () => ipcRenderer.invoke('shortcuts:get-all'),
    toggle: (accelerator: string, enabled: boolean) => 
      ipcRenderer.invoke('shortcuts:toggle', accelerator, enabled),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OVERDUE POPUP
  // ═══════════════════════════════════════════════════════════════════════
  overduePopup: {
    restore: () => ipcRenderer.invoke('overdue-popup:restore'),
    refresh: () => ipcRenderer.invoke('overdue-popup:refresh'),
    isOpen: () => ipcRenderer.invoke('overdue-popup:is-open'),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COMPROMISOS - Acciones específicas por tipo
  // ═══════════════════════════════════════════════════════════════════════
  commitment: {
    getConfig: () => ipcRenderer.invoke('commitment:get-config'),
    // Llamadas
    startCall: (taskId: string) => ipcRenderer.invoke('commitment:start-call', taskId),
    completeCall: (taskId: string, notes?: string) => ipcRenderer.invoke('commitment:complete-call', taskId, notes),
    retryCall: (taskId: string, retryInDays: number) => ipcRenderer.invoke('commitment:retry-call', taskId, retryInDays),
    // Emails
    markEmailSent: (taskId: string) => ipcRenderer.invoke('commitment:mark-email-sent', taskId),
    waitEmailResponse: (taskId: string, reminderInDays: number) => ipcRenderer.invoke('commitment:wait-email-response', taskId, reminderInDays),
    // Video
    getMeetingUrl: (taskId: string) => ipcRenderer.invoke('commitment:get-meeting-url', taskId),
    // Viajes
    getTripSubEvents: (tripId: string) => ipcRenderer.invoke('commitment:get-trip-subevents', tripId),
    // Conflictos
    checkTravelConflicts: (data: {
      meetingStart: string;
      meetingEnd: string;
      travelTimeMinutes: number;
      returnTravelMinutes?: number;
      excludeTaskId?: string;
    }) => ipcRenderer.invoke('commitment:check-travel-conflicts', data),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UBICACIONES
  // ═══════════════════════════════════════════════════════════════════════
  locations: {
    getAll: () => ipcRenderer.invoke('location:get-all'),
    create: (data: { name: string; address?: string; city?: string; province?: string }) => 
      ipcRenderer.invoke('location:create', data),
    search: (query: string) => ipcRenderer.invoke('location:search', query),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS (Renderer escucha eventos de Main)
  // ═══════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // Lista blanca de canales permitidos para escuchar
    const validChannels: string[] = [
      IPC_CHANNELS.NOTIFICATION_CLICKED,
      IPC_CHANNELS.NOTIFICATION_ACTION,
      'shortcut:new-task',
      'shortcut:quick-search',
      'theme:changed',
      'connection:changed',
      'pending-changes:updated',
      'tasks:refresh',
      'task:edit',
      'new-task',
      'new-project',
      'navigate',
      'toggle-command-palette',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// Exponer API al renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('[Preload] electronAPI exposed to renderer');

// TypeScript: Declarar tipo global
export type ElectronAPI = typeof electronAPI;
