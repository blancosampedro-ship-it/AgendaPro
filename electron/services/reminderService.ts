/**
 * Reminder Service
 * Operaciones para reminders y cola de notificaciones
 */

import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';
import { REMINDER_OPTIONS, DEFAULT_REMINDERS, type CommitmentType } from './commitmentService';

// Ventana de tolerancia para anti-duplicados: 2 minutos
const DUPLICATE_TOLERANCE_MS = 2 * 60 * 1000;

export interface CreateReminderInput {
  taskId: string;
  fireAt: Date;
  type?: 'due' | 'reminder' | 'followup';
  relativeMinutes?: number;
  advanceMinutes?: number;
  advanceLabel?: string;
}

export interface ReminderWithAdvance {
  advanceMinutes: number;
  advanceLabel: string;
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
      advanceMinutes: input.advanceMinutes,
      advanceLabel: input.advanceLabel,
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
 * Calcula la fecha de disparo del recordatorio basado en la fecha del evento y la antelación
 */
export function calculateFireAt(eventDate: Date, advanceMinutes: number): Date {
  return new Date(eventDate.getTime() - advanceMinutes * 60 * 1000);
}

/**
 * Obtiene la etiqueta para una antelación en minutos
 */
export function getAdvanceLabel(advanceMinutes: number): string {
  const option = REMINDER_OPTIONS.find(opt => opt.advanceMinutes === advanceMinutes);
  return option?.label ?? `${advanceMinutes} minutos antes`;
}

/**
 * Crea múltiples reminders para una tarea con antelaciones específicas
 */
export async function createRemindersForTask(
  taskId: string,
  eventDate: Date,
  advanceMinutesList: number[]
) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  const reminders = [];
  
  for (const advanceMinutes of advanceMinutesList) {
    const fireAt = calculateFireAt(eventDate, advanceMinutes);
    const advanceLabel = getAdvanceLabel(advanceMinutes);
    
    // Solo crear si la fecha de disparo es futura o es el evento mismo
    if (fireAt >= new Date() || advanceMinutes === 0) {
      const reminder = await db.reminder.create({
        data: {
          taskId,
          fireAt,
          type: advanceMinutes === 0 ? 'due' : 'reminder',
          advanceMinutes,
          advanceLabel,
          deviceId,
        },
      });
      
      // Agregar a la cola de notificaciones
      await db.nextNotification.create({
        data: {
          reminderId: reminder.id,
          nextFireAt: fireAt,
        },
      });
      
      reminders.push(reminder);
      logger.info(`Reminder created: ${reminder.id} (${advanceLabel}) for task ${taskId}`);
    }
  }
  
  return reminders;
}

/**
 * Crea reminders por defecto según el tipo de compromiso
 */
export async function createDefaultRemindersForTask(
  taskId: string,
  eventDate: Date,
  commitmentType: CommitmentType
) {
  const defaultAdvances = DEFAULT_REMINDERS[commitmentType] || DEFAULT_REMINDERS.task;
  return createRemindersForTask(taskId, eventDate, defaultAdvances);
}

/**
 * Actualiza los reminders de una tarea
 * - Elimina los reminders existentes que no están en la nueva lista
 * - Crea los nuevos reminders que no existían
 * - Actualiza los reminders existentes si cambió la fecha del evento
 */
export async function updateRemindersForTask(
  taskId: string,
  eventDate: Date,
  newAdvanceMinutesList: number[]
) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Obtener reminders actuales
  const existingReminders = await db.reminder.findMany({
    where: { taskId, deletedAt: null, dismissed: false },
  });
  
  const existingAdvances = new Set(
    existingReminders
      .filter(r => r.advanceMinutes !== null)
      .map(r => r.advanceMinutes!)
  );
  const newAdvances = new Set(newAdvanceMinutesList);
  
  // Reminders a eliminar
  const toDelete = existingReminders.filter(
    r => r.advanceMinutes !== null && !newAdvances.has(r.advanceMinutes!)
  );
  
  // Antelaciones a crear
  const toCreate = newAdvanceMinutesList.filter(adv => !existingAdvances.has(adv));
  
  // Reminders a actualizar (si cambió la fecha del evento)
  const toUpdate = existingReminders.filter(
    r => r.advanceMinutes !== null && newAdvances.has(r.advanceMinutes!)
  );
  
  // Eliminar reminders obsoletos
  for (const reminder of toDelete) {
    await db.nextNotification.delete({ where: { reminderId: reminder.id } }).catch(() => {});
    await db.reminder.update({
      where: { id: reminder.id },
      data: { deletedAt: new Date(), syncVersion: { increment: 1 } },
    });
    logger.info(`Reminder deleted: ${reminder.id}`);
  }
  
  // Crear nuevos reminders
  for (const advanceMinutes of toCreate) {
    const fireAt = calculateFireAt(eventDate, advanceMinutes);
    const advanceLabel = getAdvanceLabel(advanceMinutes);
    
    const reminder = await db.reminder.create({
      data: {
        taskId,
        fireAt,
        type: advanceMinutes === 0 ? 'due' : 'reminder',
        advanceMinutes,
        advanceLabel,
        deviceId,
      },
    });
    
    await db.nextNotification.create({
      data: { reminderId: reminder.id, nextFireAt: fireAt },
    });
    
    logger.info(`Reminder created: ${reminder.id} (${advanceLabel})`);
  }
  
  // Actualizar fechas de reminders existentes
  for (const reminder of toUpdate) {
    const newFireAt = calculateFireAt(eventDate, reminder.advanceMinutes!);
    
    if (reminder.fireAt.getTime() !== newFireAt.getTime()) {
      await db.reminder.update({
        where: { id: reminder.id },
        data: {
          fireAt: newFireAt,
          firedAt: null, // Reset para que pueda volver a disparar
          lastNotifiedAt: null,
          syncVersion: { increment: 1 },
        },
      });
      
      await db.nextNotification.upsert({
        where: { reminderId: reminder.id },
        create: { reminderId: reminder.id, nextFireAt: newFireAt },
        update: { nextFireAt: newFireAt, lockedUntil: null },
      });
      
      logger.info(`Reminder updated: ${reminder.id} new fireAt: ${newFireAt}`);
    }
  }
  
  // Retornar todos los reminders actuales
  return db.reminder.findMany({
    where: { taskId, deletedAt: null, dismissed: false },
    orderBy: { fireAt: 'asc' },
  });
}

/**
 * Elimina todos los reminders de una tarea
 */
export async function deleteAllRemindersForTask(taskId: string) {
  const db = getDatabase();
  
  const reminders = await db.reminder.findMany({
    where: { taskId, deletedAt: null },
  });
  
  for (const reminder of reminders) {
    await db.nextNotification.delete({ where: { reminderId: reminder.id } }).catch(() => {});
    await db.reminder.update({
      where: { id: reminder.id },
      data: { deletedAt: new Date(), syncVersion: { increment: 1 } },
    });
  }
  
  logger.info(`All reminders deleted for task ${taskId}`);
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
