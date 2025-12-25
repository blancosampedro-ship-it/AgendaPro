/**
 * Notification Manager
 * Gestiona notificaciones usando popup estilo Spotlight
 * 
 * En lugar de notificaciones nativas que desaparecen, usamos un popup
 * elegante y persistente que permanece hasta que el usuario actúe.
 */

import { Notification } from 'electron';
import { Task, Reminder } from '@prisma/client';
import { showReminderPopup, ReminderPopupData } from '../windows/reminderPopup';
import { updateTrayIcon } from '../tray/trayManager';
import { logger } from '../utils/logger';

/**
 * Envía una notificación de tarea usando el popup estilo Spotlight
 * El popup permanece visible hasta que el usuario actúe
 */
export async function sendTaskNotification(task: Task & { project?: { name: string } | null }, reminder: Reminder): Promise<void> {
  logger.info(`Sending reminder popup for task: ${task.title}`);
  
  // Parsear subtareas si existen
  let subtasksCount = 0;
  let subtasksDone = 0;
  if (task.subtasks) {
    try {
      const subtasks = JSON.parse(task.subtasks);
      subtasksCount = subtasks.length;
      subtasksDone = subtasks.filter((s: any) => s.done).length;
    } catch {}
  }
  
  // Parsear tags si existen
  let tags: string[] | null = null;
  if (task.tags) {
    try {
      tags = JSON.parse(task.tags);
    } catch {}
  }
  
  // Preparar datos para el popup
  const popupData: ReminderPopupData = {
    taskId: task.id,
    reminderId: reminder.id,
    taskTitle: task.title,
    taskNotes: task.notes,
    dueDate: task.dueDate,
    priority: task.priority,
    projectName: task.project?.name || null,
    tags,
    isRecurring: task.isRecurring,
    subtasksCount,
    subtasksDone,
  };
  
  // Mostrar popup estilo Spotlight
  showReminderPopup(popupData);
  
  // Actualizar tray icon para mostrar alerta
  updateTrayIcon(true);
  
  // Quitar alerta del tray después de 60 segundos (el popup sigue visible)
  setTimeout(() => {
    updateTrayIcon(false);
  }, 60000);
}

/**
 * Envía una notificación simple (confirmación, etc.)
 */
export function sendSimpleNotification(title: string, body: string): void {
  new Notification({
    title,
    body,
    silent: true,
  }).show();
}

/**
 * Formatea hora para mostrar
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Trunca texto
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
