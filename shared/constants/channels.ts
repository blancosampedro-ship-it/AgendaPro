/**
 * IPC Channel Definitions
 * Canales de comunicación entre Main y Renderer
 */

export const IPC_CHANNELS = {
  // Window management
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_SHOW: 'window:show',
  
  // App
  APP_QUIT: 'app:quit',
  APP_GET_VERSION: 'app:get-version',
  APP_GET_DEVICE_ID: 'app:get-device-id',
  
  // Tasks (para Fase 2+)
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_GET_ALL: 'task:get-all',
  TASK_COMPLETE: 'task:complete',
  
  // Reminders (para Fase 2+)
  REMINDER_CREATE: 'reminder:create',
  REMINDER_SNOOZE: 'reminder:snooze',
  REMINDER_DISMISS: 'reminder:dismiss',
  
  // Notifications
  NOTIFICATION_CLICKED: 'notification:clicked',
  NOTIFICATION_ACTION: 'notification:action',
  
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
