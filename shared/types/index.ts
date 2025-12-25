/**
 * Shared Type Definitions
 */

// Task types
export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  projectId?: string | null;
  sortOrder: number;
  tags?: string | null;
  priority: number;
  dueDate?: Date | null;
  startDate?: Date | null;
  isWaitingFor: boolean;
  waitingForNote?: string | null;
  followUpDate?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deviceId: string;
  syncVersion: number;
}

// Reminder types
export interface Reminder {
  id: string;
  taskId: string;
  fireAt: Date;
  type: 'due' | 'reminder' | 'followup';
  relativeMinutes?: number | null;
  lastNotifiedAt?: Date | null;
  lastNotifiedDeviceId?: string | null;
  snoozedUntil?: Date | null;
  snoozeCount: number;
  repeatRule?: string | null;
  repeatEndDate?: Date | null;
  dismissed: boolean;
  firedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deviceId: string;
  syncVersion: number;
}

// NextNotification (cola del scheduler)
export interface NextNotification {
  id: string;
  reminderId: string;
  nextFireAt: Date;
  lockedUntil?: Date | null;
  lockedByDevice?: string | null;
  lastProcessedAt?: Date | null;
  processCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Project types
export interface Project {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deviceId: string;
  syncVersion: number;
}

// Snooze options
export type SnoozeOption = 
  | { type: 'minutes'; value: number }
  | { type: 'tomorrow'; time: string }
  | { type: 'custom'; date: Date };

// Notification action from user
export interface NotificationAction {
  reminderId: string;
  action: 'complete' | 'snooze' | 'dismiss' | 'open';
  snoozeOption?: SnoozeOption;
}
