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

// Opciones de recordatorio con antelación
export interface ReminderOption {
  advanceMinutes: number;
  advanceLabel: string;
}

export interface ReminderInfo {
  id: string;
  taskId: string;
  fireAt: Date;
  advanceMinutes: number;
  advanceLabel: string;
  type: string;
  dismissed?: boolean;
  firedAt?: Date | null;
}

// Parsed Task Input (resultado del asistente IA)
export interface ParsedTaskInput {
  type: 'task' | 'call' | 'email' | 'video' | 'meeting' | 'trip';
  title: string;
  cleanTitle?: string;
  dueDate?: string;
  dueTime?: string;
  endDate?: string;
  endTime?: string;
  location?: string;
  participants?: string[];
  priority?: number;
  subtasks?: string[];
  typeData?: {
    platform?: string;
    meetingUrl?: string;
    contactName?: string;
    subject?: string;
    recipient?: string;
    destination?: string;
    transportMode?: string;
  };
  confidence: 'high' | 'medium' | 'low';
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
  getUpcomingTasks: (days?: number) => Promise<unknown[]>;
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

  // Schedule Analyzer
  schedule: {
    analyze: (proposedDate: string, excludeTaskId?: string) => Promise<{
      conflicts: { hasConflicts: boolean; conflicts: unknown[] };
      dayLoad: { date: string; taskCount: number; level: string; tasks: unknown[] };
      suggestions: Array<{ date: string; reason: string; dayLoad: string }>;
      warning: string | null;
      nonWorkingDayWarning: string | null;
    }>;
    checkConflicts: (proposedDate: string, excludeTaskId?: string) => Promise<{
      hasConflicts: boolean;
      conflicts: unknown[];
    }>;
    getWeekAnalysis: (startDate?: string) => Promise<unknown[]>;
    detectAllConflicts: () => Promise<unknown[]>;
    isWorkingDay: (date: string) => Promise<boolean>;
  };

  // Holidays - Gestión de festivos de Madrid Capital
  holidays: {
    getAll: () => Promise<Array<{ id: string; name: string; date: string; recurring: boolean }>>;
    add: (data: { name: string; date: string; recurring: boolean }) => Promise<{ success: boolean }>;
    remove: (id: string) => Promise<{ success: boolean }>;
    isHoliday: (date: string) => Promise<{ isHoliday: boolean; name?: string }>;
    getHolyWeek: (startYear: number, endYear: number) => Promise<Array<{
      year: number;
      holyThursday: string;
      goodFriday: string;
      easterSunday: string;
    }>>;
  };

  // Reminders
  createReminder: (data: unknown) => Promise<unknown>;
  snoozeReminder: (id: string, option: unknown) => Promise<unknown>;
  dismissReminder: (id: string) => Promise<unknown>;
  
  // API de recordatorios múltiples con antelación
  reminders: {
    getForTask: (taskId: string) => Promise<ReminderInfo[]>;
    updateForTask: (taskId: string, eventDate: string, advanceMinutesList: number[]) => Promise<ReminderInfo[]>;
    getOptions: () => Promise<ReminderOption[]>;
    getDefaults: (commitmentType: string) => Promise<ReminderOption[]>;
  };

  // Settings
  settings: {
    get: () => Promise<{
      id: string;
      defaultReminderTime: string;
      weekStartsOn: number;
      notificationSound: boolean;
      notificationBadge: boolean;
      snoozeShort: number;
      snoozeMedium: number;
      snoozeLong: number;
      snoozeTomorrowTime: string;
      firebaseEnabled: boolean;
      lastSyncAt: string | null;
      autoBackupEnabled: boolean;
      autoBackupIntervalH: number;
      lastBackupAt: string | null;
      sidebarCollapsed: boolean;
      theme: string;
      avoidWeekends: boolean;
      avoidHolidays: boolean;
      workingDaysStart: number;
      workingDaysEnd: number;
      updatedAt: string;
      deviceId: string;
    }>;
    update: (settings: Partial<{
      defaultReminderTime: string;
      notificationSound: boolean;
      notificationBadge: boolean;
      snoozeShort: number;
      snoozeMedium: number;
      snoozeLong: number;
      snoozeTomorrowTime: string;
      firebaseEnabled: boolean;
      autoBackupEnabled: boolean;
      autoBackupIntervalH: number;
      sidebarCollapsed: boolean;
      theme: string;
      avoidWeekends: boolean;
      avoidHolidays: boolean;
      workingDaysStart: number;
      workingDaysEnd: number;
    }>) => Promise<unknown>;
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

  // AI Assistant
  ai: {
    getConfig: () => Promise<{ model: string; enabled: boolean; hasApiKey: boolean }>;
    saveConfig: (config: { apiKey?: string; model?: string; enabled?: boolean }) => Promise<{ success: boolean }>;
    validateKey: (apiKey: string) => Promise<{ valid: boolean; error?: string }>;
    chat: (message: string, context?: any) => Promise<{ success: boolean; message?: string; error?: string }>;
    suggestTime: (taskTitle: string, existingTasks: any[]) => Promise<{ success: boolean; suggestion?: string; error?: string }>;
    generateSubtasks: (taskTitle: string, taskNotes?: string) => Promise<{ success: boolean; subtasks?: string[]; error?: string }>;
    prioritize: (tasks: any[]) => Promise<{ success: boolean; analysis?: string; error?: string }>;
    isAvailable: () => Promise<boolean>;
    // Asistente de creación de tareas (Hybrid)
    parseTaskBasic: (input: string) => Promise<{ success: boolean; parsed?: ParsedTaskInput; error?: string }>;
    parseTaskDeep: (input: string, options?: { generateSubtasks?: boolean }) => Promise<{ success: boolean; parsed?: ParsedTaskInput; error?: string }>;
    // Detección de tareas similares/duplicadas (LOCAL - instantáneo)
    findSimilarLocal: (newTitle: string, pendingTasks: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null }>) => Promise<{ 
      success: boolean; 
      similar: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null; similarity: number }>; 
    }>;
    // Detección de tareas similares/duplicadas (IA - más preciso pero lento)
    findSimilar: (newTitle: string, pendingTasks: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null }>) => Promise<{ 
      success: boolean; 
      similar?: Array<{ id: string; title: string; dueDate: string | null; projectName: string | null; similarity: number }>; 
      error?: string 
    }>;
  };

  // Contacts / Team
  contacts: {
    getAll: () => Promise<{ id: string; name: string; email: string | null; color: string; _count: { tasks: number } }[]>;
    create: (data: { name: string; email?: string; color?: string }) => Promise<unknown>;
    update: (id: string, data: { name?: string; email?: string; color?: string }) => Promise<unknown>;
    delete: (id: string) => Promise<unknown>;
  };

  // Attachments
  attachments: {
    getAll: (taskId: string) => Promise<Attachment[]>;
    addFile: (data: { taskId: string; filePath: string; name?: string }) => Promise<Attachment>;
    addUrl: (data: { taskId: string; url: string; name?: string }) => Promise<Attachment>;
    addEmail: (data: { taskId: string; url: string; name?: string; metadata?: { from?: string; subject?: string; date?: string } }) => Promise<Attachment>;
    delete: (id: string) => Promise<{ success: boolean }>;
    open: (id: string) => Promise<boolean>;
    getContent: (id: string) => Promise<{ data: string; mimeType: string } | null>;
    selectFile: () => Promise<string | null>;
  };

  // Commitments (Fase 7)
  commitment: {
    getConfig: () => Promise<Record<CommitmentType, CommitmentConfig>>;
    startCall: (taskId: string) => Promise<any>;
    completeCall: (taskId: string, outcome?: string) => Promise<any>;
    retryCall: (taskId: string) => Promise<any>;
    markEmailSent: (taskId: string) => Promise<any>;
    waitEmailResponse: (taskId: string, deadline?: string) => Promise<any>;
    getMeetingUrl: (taskId: string) => Promise<string | null>;
    getTripSubEvents: (tripId: string) => Promise<any[]>;
    checkTravelConflicts: (eventId: string, proposedDate: string, locationId?: string) => Promise<TravelConflict[]>;
  };

  // Locations (Fase 7)
  locations: {
    getAll: () => Promise<Location[]>;
    create: (data: { name: string; address?: string; city?: string; province?: string; country?: string; latitude?: number; longitude?: number }) => Promise<Location>;
    search: (query: string) => Promise<Location[]>;
  };

  // Events
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
}

export interface Attachment {
  id: string;
  taskId: string;
  type: 'file' | 'url' | 'email';
  name: string;
  filePath?: string | null;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  metadata?: string | null;
  createdAt: string;
}

// Commitment Types
export type CommitmentType = 'task' | 'call' | 'email' | 'video' | 'meeting' | 'trip';
export type CommitmentStatus = 'pending' | 'in_progress' | 'done' | 'waiting' | 'sent';

export interface CommitmentConfig {
  label: string;
  icon: string;
  color: string;
  hasEndDate: boolean;
  hasLocation: boolean;
  defaultDuration: number;
  statuses: CommitmentStatus[];
}

export interface Location {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallData {
  contactName?: string;
  phoneNumber?: string;
  reason?: string;
  outcome?: string;
  callAttempts?: number;
  lastAttemptAt?: string;
}

export interface EmailData {
  subject?: string;
  recipients?: string[];
  body?: string;
  responseExpected?: boolean;
  responseDeadline?: string;
}

export interface VideoData {
  platform?: 'zoom' | 'meet' | 'teams' | 'other';
  meetingUrl?: string;
  meetingId?: string;
  password?: string;
  participants?: string[];
  agenda?: string;
}

export interface MeetingData {
  meetingType?: 'one_on_one' | 'team' | 'client' | 'external';
  travelTimeMinutes?: number;
  returnTimeMinutes?: number;
  agenda?: string;
  participants?: string[];
  prepNotes?: string;
}

export interface TripData {
  destination?: string;
  purpose?: string;
  accommodation?: string;
  transportType?: 'flight' | 'train' | 'car' | 'other';
  transportDetails?: string;
  returnDate?: string;
}

export type TypeData = CallData | EmailData | VideoData | MeetingData | TripData | null;

export interface TravelConflict {
  type: 'overlap' | 'insufficient_travel_time';
  conflictingEvent: any;
  message: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
