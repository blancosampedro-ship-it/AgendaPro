/**
 * Reminder Service
 * Operaciones para reminders y cola de notificaciones
 */

import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';

// Ventana de tolerancia para anti-duplicados: 2 minutos
const DUPLICATE_TOLERANCE_MS = 2 * 60 * 1000;

export interface CreateReminderInput {
  taskId: string;
  fireAt: Date;
  type?: 'due' | 'reminder' | 'followup';
  relativeMinutes?: number;
}

export interface SnoozeOption {
  type: 'minutes' | 'tomorrow' | 'custom';
  value?: number; // minutos si type='minutes'
  date?: Date;    // fecha si type='custom'
  time?: string;  // hora si type='tomorrow' (ej: "09:00")
}

/**
 * Crea un nuevo reminder
 */
export async function createReminder(input: CreateReminderInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const reminder = await db.reminder.create({
    data: {
      taskId: input.taskId,
      fireAt: input.fireAt,
      type: input.type ?? 'reminder',
      relativeMinutes: input.relativeMinutes,
      deviceId,
    },
  });
  
  // Agregar a la cola de notificaciones
  await db.nextNotification.create({
    data: {
      reminderId: reminder.id,
      nextFireAt: input.fireAt,
    },
  });
  
  logger.info(`Reminder created: ${reminder.id} for task ${input.taskId}`);
  return reminder;
}

/**
 * Obtiene el próximo reminder a disparar
 */
export async function getNextReminder() {
  const db = getDatabase();
  
  const next = await db.nextNotification.findFirst({
    where: {
      lockedUntil: null,
    },
    orderBy: {
      nextFireAt: 'asc',
    },
    include: {
      reminder: {
        include: {
          task: true,
        },
      },
    },
  });
  
  return next;
}

/**
 * Obtiene todos los reminders vencidos (para catch-up)
 */
export async function getOverdueReminders(limit: number = 10) {
  const db = getDatabase();
  const now = new Date();
  
  return db.nextNotification.findMany({
    where: {
      nextFireAt: { lte: now },
      lockedUntil: null,
    },
    orderBy: {
      nextFireAt: 'asc',
    },
    take: limit,
    include: {
      reminder: {
        include: {
          task: true,
        },
      },
    },
  });
}

/**
 * Bloquea un reminder para procesarlo (evita doble disparo)
 */
export async function lockReminder(notificationId: string, lockDurationMs: number = 30000) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const lockedUntil = new Date(Date.now() + lockDurationMs);
  
  return db.nextNotification.update({
    where: { id: notificationId },
    data: {
      lockedUntil,
      lockedByDevice: deviceId,
    },
  });
}

/**
 * Marca un reminder como notificado
 */
export async function markReminderAsNotified(reminderId: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  const now = new Date();
  
  // Actualizar el reminder
  await db.reminder.update({
    where: { id: reminderId },
    data: {
      lastNotifiedAt: now,
      lastNotifiedDeviceId: deviceId,
      firedAt: now,
      syncVersion: { increment: 1 },
    },
  });
  
  // Eliminar de la cola (o actualizar si tiene repetición)
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
  });
  
  if (reminder?.repeatRule) {
    // TODO: Calcular próxima fecha según RRULE
    // Por ahora, eliminar de la cola
    await db.nextNotification.delete({
      where: { reminderId },
    });
  } else {
    // Sin repetición, eliminar de la cola
    await db.nextNotification.delete({
      where: { reminderId },
    });
  }
  
  logger.info(`Reminder marked as notified: ${reminderId}`);
}

/**
 * Verifica si ya se notificó recientemente (anti-duplicados)
 */
export async function wasRecentlyNotified(reminderId: string): Promise<boolean> {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
  });
  
  if (!reminder?.lastNotifiedAt) {
    return false;
  }
  
  const timeSinceLastNotification = Date.now() - reminder.lastNotifiedAt.getTime();
  
  // Si se notificó hace menos de 2 minutos por otro dispositivo, es duplicado
  if (timeSinceLastNotification < DUPLICATE_TOLERANCE_MS) {
    if (reminder.lastNotifiedDeviceId !== deviceId) {
      logger.debug(`Skipping duplicate notification for reminder ${reminderId}`);
      return true;
    }
  }
  
  return false;
}

/**
 * Pospone un reminder (snooze)
 */
export async function snoozeReminder(reminderId: string, option: SnoozeOption) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  let snoozedUntil: Date;
  
  switch (option.type) {
    case 'minutes':
      snoozedUntil = new Date(Date.now() + (option.value ?? 10) * 60 * 1000);
      break;
    case 'tomorrow':
      snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + 1);
      const [hours, minutes] = (option.time ?? '09:00').split(':').map(Number);
      snoozedUntil.setHours(hours, minutes, 0, 0);
      break;
    case 'custom':
      if (!option.date) {
        throw new Error('Custom snooze requires a date');
      }
      snoozedUntil = option.date;
      break;
    default:
      snoozedUntil = new Date(Date.now() + 10 * 60 * 1000); // Default 10 min
  }
  
  // Actualizar reminder
  const reminder = await db.reminder.update({
    where: { id: reminderId },
    data: {
      snoozedUntil,
      fireAt: snoozedUntil, // También actualizar fireAt
      snoozeCount: { increment: 1 },
      firedAt: null, // Reset para que pueda volver a disparar
      lastNotifiedAt: null,
      syncVersion: { increment: 1 },
    },
  });
  
  // Actualizar o crear entrada en la cola
  await db.nextNotification.upsert({
    where: { reminderId },
    create: {
      reminderId,
      nextFireAt: snoozedUntil,
    },
    update: {
      nextFireAt: snoozedUntil,
      lockedUntil: null,
      lockedByDevice: null,
      lastProcessedAt: new Date(),
      processCount: { increment: 1 },
    },
  });
  
  // IMPORTANTE: Actualizar también la fecha de vencimiento de la tarea
  const reminderWithTask = await db.reminder.findUnique({
    where: { id: reminderId },
    select: { taskId: true },
  });
  
  if (reminderWithTask) {
    // Actualizar la fecha de la tarea
    await db.task.update({
      where: { id: reminderWithTask.taskId },
      data: {
        dueDate: snoozedUntil,
        syncVersion: { increment: 1 },
      },
    });
    
    // Registrar evento
    await db.taskEvent.create({
      data: {
        taskId: reminderWithTask.taskId,
        eventType: 'snoozed',
        eventData: JSON.stringify({ snoozedUntil, option }),
        deviceId,
      },
    });
  }
  
  logger.info(`Reminder snoozed: ${reminderId} until ${snoozedUntil}`);
  return reminder;
}

/**
 * Descarta un reminder (dismiss)
 */
export async function dismissReminder(reminderId: string) {
  const db = getDatabase();
  
  await db.reminder.update({
    where: { id: reminderId },
    data: {
      dismissed: true,
      syncVersion: { increment: 1 },
    },
  });
  
  // Eliminar de la cola
  await db.nextNotification.delete({
    where: { reminderId },
  }).catch(() => {
    // Puede no existir en la cola
  });
  
  logger.info(`Reminder dismissed: ${reminderId}`);
}

/**
 * Obtiene reminders activos para una tarea
 */
export async function getRemindersForTask(taskId: string) {
  const db = getDatabase();
  
  return db.reminder.findMany({
    where: {
      taskId,
      deletedAt: null,
      dismissed: false,
    },
    orderBy: { fireAt: 'asc' },
  });
}
