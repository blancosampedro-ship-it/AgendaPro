/**
 * Type declarations for Electron API exposed via preload
 */

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: Date | null;
  pendingChanges: number;
}

export interface BackupMetadata {
  id: string;
  timestamp: Date;
  deviceId: string;
  taskCount: number;
  projectCount: number;
  encrypted: boolean;
  location: 'local' | 'cloud';
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  app: {
    quit: () => Promise<void>;
    getVersion: () => Promise<string>;
    getDeviceId: () => Promise<string>;
  };
  
  // Tasks
  getAllTasks: () => Promise<unknown[]>;
  getTask: (id: string) => Promise<unknown>;
  getTodayTasks: () => Promise<unknown[]>;
  getOverdueTasks: () => Promise<unknown[]>;
  getUpcomingTasks: () => Promise<unknown[]>;
  getWaitingTasks: () => Promise<unknown[]>;
  searchTasks: (query: string) => Promise<unknown[]>;
  getTasksByProject: (projectId: string | null) => Promise<unknown[]>;
  createTask: (task: unknown) => Promise<unknown>;
  updateTask: (id: string, data: unknown) => Promise<unknown>;
  deleteTask: (id: string) => Promise<unknown>;
  completeTask: (id: string) => Promise<unknown>;
  reopenTask: (id: string) => Promise<unknown>;

  // Projects
  getAllProjects: () => Promise<unknown[]>;
  createProject: (data: unknown) => Promise<unknown>;
  updateProject: (id: string, data: unknown) => Promise<unknown>;
  archiveProject: (id: string) => Promise<unknown>;
  deleteProject: (id: string) => Promise<unknown>;

  // Subtasks
  toggleSubtask: (taskId: string, subtaskId: string, done: boolean) => Promise<unknown>;

  // Tags
  getAllTags: () => Promise<unknown[]>;
  createTag: (name: string, color?: string) => Promise<unknown>;
  deleteTag: (id: string) => Promise<unknown>;
  getTasksByTag: (tagName: string) => Promise<unknown[]>;

  // Reminders
  createReminder: (data: unknown) => Promise<unknown>;
  snoozeReminder: (id: string, option: unknown) => Promise<unknown>;
  dismissReminder: (id: string) => Promise<unknown>;

  // Settings
  settings: {
    get: () => Promise<unknown>;
    update: (settings: unknown) => Promise<unknown>;
  };

  // Firebase (Fase 5)
  firebase: {
    isConfigured: () => Promise<boolean>;
    getConfigStatus: () => Promise<{ configured: boolean; initialized: boolean }>;
  };

  // Auth (Fase 5) - Email/Password
  auth: {
    signUp: (email: string, password: string, displayName?: string) => Promise<User | null>;
    signIn: (email: string, password: string) => Promise<User | null>;
    signOut: () => Promise<{ success: boolean }>;
    resetPassword: (email: string) => Promise<{ success: boolean }>;
    getCurrentUser: () => Promise<User | null>;
    isAuthenticated: () => Promise<boolean>;
    restoreSession: () => Promise<User | null>;
  };

  // Sync (Fase 5)
  sync: {
    syncAll: () => Promise<SyncResult>;
    getStatus: () => Promise<SyncStatus>;
    forcePush: () => Promise<SyncResult>;
    forcePull: () => Promise<SyncResult>;
  };

  // Backup (Fase 5)
  backup: {
    createLocal: (password?: string) => Promise<string>;
    restoreLocal: (filePath: string, password?: string, overwrite?: boolean) => Promise<{ success: boolean }>;
    listLocal: () => Promise<BackupMetadata[]>;
    deleteLocal: (fileName: string) => Promise<{ success: boolean }>;
    createCloud: (password?: string) => Promise<string>;
    listCloud: () => Promise<BackupMetadata[]>;
    restoreCloud: (backupId: string, password?: string, overwrite?: boolean) => Promise<{ success: boolean }>;
  };

  // Export/Import (Fase 6)
  export: {
    toJSON: (options?: { includeCompleted?: boolean; projectIds?: string[] }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    getStats: () => Promise<{ projects: number; tasks: number; completedTasks: number; tags: number; reminders: number }>;
  };
  import: {
    fromJSON: (options?: { merge?: boolean }) => Promise<{ success: boolean; message: string; imported?: { projects: number; tasks: number; tags: number; reminders: number; subtasks: number }; errors?: string[] }>;
  };

  // Themes (Fase 6)
  theme: {
    get: () => Promise<{ mode: 'light' | 'dark' | 'system'; isDark: boolean; systemPrefersDark: boolean }>;
    set: (mode: 'light' | 'dark' | 'system') => Promise<{ success: boolean; mode: string }>;
    cycle: () => Promise<{ success: boolean; mode: string }>;
  };

  // Offline (Fase 6)
  offline: {
    getStatus: () => Promise<{ isOnline: boolean; pendingChanges: number; lastCheck: Date }>;
    checkConnection: () => Promise<boolean>;
    syncPending: () => Promise<{ processed: number; remaining: number }>;
  };

  // Shortcuts (Fase 6)
  shortcuts: {
    getAll: () => Promise<{ registered: { accelerator: string; action: string; description: string; enabled: boolean }[]; defaults: { accelerator: string; action: string; description: string; enabled: boolean }[] }>;
    toggle: (accelerator: string, enabled: boolean) => Promise<{ success: boolean }>;
  };

  // Overdue Popup
  overduePopup: {
    restore: () => Promise<{ success: boolean }>;
    refresh: () => Promise<{ success: boolean }>;
    isOpen: () => Promise<boolean>;
  };

  // Events
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
