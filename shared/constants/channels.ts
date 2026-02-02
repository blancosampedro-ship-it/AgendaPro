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
  REMINDER_GET_FOR_TASK: 'reminder:get-for-task',
  REMINDER_UPDATE_FOR_TASK: 'reminder:update-for-task',
  REMINDER_GET_OPTIONS: 'reminder:get-options',
  REMINDER_GET_DEFAULTS: 'reminder:get-defaults',
  REMINDER_GET_ALL: 'reminder:get-all',
  REMINDER_UPDATE: 'reminder:update',
  REMINDER_DELETE: 'reminder:delete',
  
  // Notifications
  NOTIFICATION_CLICKED: 'notification:clicked',
  NOTIFICATION_ACTION: 'notification:action',
  
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  
  // Outlook integration
  OUTLOOK_CAPTURE_EMAIL: 'outlook:capture-email',
  OUTLOOK_IS_AVAILABLE: 'outlook:is-available',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
