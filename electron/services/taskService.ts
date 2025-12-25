/**
 * Task Service
 * Operaciones CRUD para tareas
 */

import { getDatabase } from '../database/connection';
import { getDeviceId } from '../utils/deviceId';
import { logger } from '../utils/logger';

/**
 * Convierte un valor a Date si es válido
 */
function toDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'number') return new Date(value);
  return undefined;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  projectId?: string;
  dueDate?: Date | string;
  priority?: number;
  tags?: string[];
  // Waiting for
  isWaitingFor?: boolean;
  waitingForNote?: string;
  // Reminder
  addReminder?: boolean;
  // Fase 4: Recurrencia
  isRecurring?: boolean;
  recurrenceRule?: string; // "daily", "weekly", "monthly", "weekdays", custom RRULE
  recurrenceEnd?: Date | string;
  // Fase 4: Subtareas
  subtasks?: Subtask[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  projectId?: string;
  dueDate?: Date | string | null;
  priority?: number;
  tags?: string[] | null;
  isWaitingFor?: boolean;
  waitingForNote?: string | null;
  followUpDate?: Date | string | null;
  // Reminder
  addReminder?: boolean;
  // Fase 4: Recurrencia
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | string | null;
  // Fase 4: Subtareas
  subtasks?: Subtask[] | null;
}

/**
 * Obtiene todas las tareas no eliminadas
 */
export async function getAllTasks() {
  const db = getDatabase();
  
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      project: true,
      reminders: {
        where: { deletedAt: null },
      },
    },
    orderBy: [
      { completedAt: 'asc' }, // No completadas primero
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ],
  });
  
  logger.debug(`Fetched ${tasks.length} tasks`);
  return tasks;
}

/**
 * Obtiene tareas para "Hoy"
 */
export async function getTodayTasks() {
  const db = getDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: {
        gte: today,
        lt: tomorrow,
      },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: { dueDate: 'asc' },
  });
}

/**
 * Obtiene tareas vencidas
 */
export async function getOverdueTasks() {
  const db = getDatabase();
  const now = new Date();
  
  return db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: {
        lt: now,
      },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: { dueDate: 'asc' },
  });
}

/**
 * Obtiene tareas de los próximos 7 días
 */
export async function getUpcomingTasks() {
  const db = getDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  return db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: {
        gte: today,
        lte: nextWeek,
      },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: { dueDate: 'asc' },
  });
}

/**
 * Obtiene tareas "Esperando respuesta"
 */
export async function getWaitingTasks() {
  const db = getDatabase();
  
  return db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      isWaitingFor: true,
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: { followUpDate: 'asc' },
  });
}

/**
 * Obtiene una tarea por ID
 */
export async function getTaskById(id: string) {
  const db = getDatabase();
  
  return db.task.findUnique({
    where: { id },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
  });
}

/**
 * Crea una nueva tarea
 */
export async function createTask(input: CreateTaskInput) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Convertir fechas
  const dueDate = toDate(input.dueDate);
  const recurrenceEnd = toDate(input.recurrenceEnd);
  
  const task = await db.task.create({
    data: {
      title: input.title,
      notes: input.notes,
      projectId: input.projectId,
      dueDate,
      priority: input.priority ?? 0,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      // Waiting for
      isWaitingFor: input.isWaitingFor ?? false,
      waitingForNote: input.waitingForNote,
      // Fase 4: Recurrencia
      isRecurring: input.isRecurring ?? false,
      recurrenceRule: input.recurrenceRule,
      recurrenceEnd,
      // Fase 4: Subtareas
      subtasks: input.subtasks ? JSON.stringify(input.subtasks) : null,
      deviceId,
    },
    include: {
      project: true,
    },
  });
  
  logger.info(`Task created: ${task.id} - ${task.title}`);
  
  // Si tiene fecha de vencimiento Y addReminder es true (o no especificado), crear reminder automático
  const shouldAddReminder = input.addReminder !== false; // Por defecto true
  if (dueDate && shouldAddReminder) {
    await createReminderForTask(task.id, dueDate, input.isRecurring ? input.recurrenceRule : undefined);
  }
  
  return task;
}

/**
 * Actualiza una tarea
 */
export async function updateTask(id: string, input: UpdateTaskInput) {
  const db = getDatabase();
  
  // Convertir fechas
  const dueDate = input.dueDate !== undefined ? toDate(input.dueDate) : undefined;
  const followUpDate = input.followUpDate !== undefined ? toDate(input.followUpDate) : undefined;
  const recurrenceEnd = input.recurrenceEnd !== undefined ? toDate(input.recurrenceEnd) : undefined;
  
  // Preparar datos para actualizar
  const updateData: any = {
    title: input.title,
    notes: input.notes,
    projectId: input.projectId,
    dueDate,
    priority: input.priority,
    isWaitingFor: input.isWaitingFor,
    waitingForNote: input.waitingForNote,
    followUpDate,
    // Fase 4: Recurrencia
    isRecurring: input.isRecurring,
    recurrenceRule: input.recurrenceRule,
    recurrenceEnd,
    syncVersion: { increment: 1 },
  };
  
  // Manejar tags (puede ser array, null o undefined)
  if (input.tags !== undefined) {
    updateData.tags = input.tags ? JSON.stringify(input.tags) : null;
  }
  
  // Manejar subtasks (puede ser array, null o undefined)
  if (input.subtasks !== undefined) {
    updateData.subtasks = input.subtasks ? JSON.stringify(input.subtasks) : null;
  }
  
  const task = await db.task.update({
    where: { id },
    data: updateData,
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // SINCRONIZAR REMINDERS CON NUEVA FECHA DE VENCIMIENTO
  // ═══════════════════════════════════════════════════════════════════════
  if (dueDate !== undefined) {
    const deviceId = getDeviceId();
    const shouldAddReminder = input.addReminder !== false;
    
    if (dueDate === null) {
      // Si se elimina la fecha, eliminar reminders de tipo 'due'
      const existingReminders = await db.reminder.findMany({
        where: { taskId: id, type: 'due', deletedAt: null },
      });
      
      for (const reminder of existingReminders) {
        await db.nextNotification.deleteMany({
          where: { reminderId: reminder.id },
        });
        await db.reminder.update({
          where: { id: reminder.id },
          data: { deletedAt: new Date() },
        });
      }
      logger.debug(`Removed reminders for task ${id} (due date cleared)`);
    } else if (shouldAddReminder) {
      // Buscar reminder de tipo 'due' existente
      const existingReminder = await db.reminder.findFirst({
        where: { taskId: id, type: 'due', deletedAt: null },
      });
      
      if (existingReminder) {
        // Actualizar reminder existente
        await db.reminder.update({
          where: { id: existingReminder.id },
          data: {
            fireAt: dueDate,
            firedAt: null, // Reset para que pueda disparar de nuevo
            lastNotifiedAt: null,
            syncVersion: { increment: 1 },
          },
        });
        
        // Actualizar o crear entrada en NextNotification
        const existingNotification = await db.nextNotification.findFirst({
          where: { reminderId: existingReminder.id },
        });
        
        if (existingNotification) {
          await db.nextNotification.update({
            where: { id: existingNotification.id },
            data: {
              nextFireAt: dueDate,
              lockedUntil: null,
              lockedByDevice: null,
            },
          });
        } else {
          await db.nextNotification.create({
            data: {
              reminderId: existingReminder.id,
              nextFireAt: dueDate,
            },
          });
        }
        logger.debug(`Updated reminder for task ${id} to new due date: ${dueDate}`);
      } else {
        // Crear nuevo reminder
        await createReminderForTask(id, dueDate, input.isRecurring ? input.recurrenceRule ?? undefined : undefined);
      }
    }
  }
  
  logger.info(`Task updated: ${task.id}`);
  return task;
}

/**
 * Completa una tarea
 */
export async function completeTask(id: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const task = await db.task.update({
    where: { id },
    data: {
      completedAt: new Date(),
      syncVersion: { increment: 1 },
    },
  });
  
  // Registrar evento
  await db.taskEvent.create({
    data: {
      taskId: id,
      eventType: 'completed',
      deviceId,
    },
  });
  
  // Eliminar notificaciones pendientes
  await db.nextNotification.deleteMany({
    where: {
      reminder: {
        taskId: id,
      },
    },
  });
  
  logger.info(`Task completed: ${task.id}`);
  return task;
}

/**
 * Reabre una tarea completada
 */
export async function reopenTask(id: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const task = await db.task.update({
    where: { id },
    data: {
      completedAt: null,
      syncVersion: { increment: 1 },
    },
  });
  
  // Registrar evento
  await db.taskEvent.create({
    data: {
      taskId: id,
      eventType: 'reopened',
      deviceId,
    },
  });
  
  logger.info(`Task reopened: ${task.id}`);
  return task;
}

/**
 * Elimina una tarea (soft delete)
 */
export async function deleteTask(id: string) {
  const db = getDatabase();
  
  const task = await db.task.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      syncVersion: { increment: 1 },
    },
  });
  
  // Eliminar reminders asociados
  await db.reminder.updateMany({
    where: { taskId: id },
    data: { deletedAt: new Date() },
  });
  
  // Eliminar de la cola de notificaciones
  await db.nextNotification.deleteMany({
    where: {
      reminder: {
        taskId: id,
      },
    },
  });
  
  logger.info(`Task deleted: ${task.id}`);
  return task;
}

/**
 * Crea un reminder automático para una tarea
 */
async function createReminderForTask(taskId: string, dueDate: Date, recurrenceRule?: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Convertir regla simple a RRULE si es necesario
  const rrule = recurrenceRule ? convertToRRule(recurrenceRule) : null;
  
  // Crear reminder para la fecha de vencimiento
  const reminder = await db.reminder.create({
    data: {
      taskId,
      fireAt: dueDate,
      type: 'due',
      repeatRule: rrule,
      deviceId,
    },
  });
  
  // Agregar a la cola de notificaciones
  await db.nextNotification.create({
    data: {
      reminderId: reminder.id,
      nextFireAt: dueDate,
    },
  });
  
  logger.debug(`Reminder created for task ${taskId} at ${dueDate}${rrule ? ` (recurring: ${rrule})` : ''}`);
  return reminder;
}

/**
 * Convierte reglas de recurrencia simples a formato RRULE
 */
function convertToRRule(rule: string): string {
  const ruleMap: Record<string, string> = {
    'daily': 'FREQ=DAILY;INTERVAL=1',
    'weekly': 'FREQ=WEEKLY;INTERVAL=1',
    'monthly': 'FREQ=MONTHLY;INTERVAL=1',
    'yearly': 'FREQ=YEARLY;INTERVAL=1',
    'weekdays': 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  };
  
  return ruleMap[rule] || rule; // Si ya es un RRULE, devolverlo tal cual
}

/**
 * Calcula la próxima fecha según la regla de recurrencia
 */
export function getNextOccurrence(currentDate: Date, recurrenceRule: string): Date {
  const nextDate = new Date(currentDate);
  
  if (recurrenceRule.includes('FREQ=DAILY')) {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (recurrenceRule.includes('FREQ=WEEKLY')) {
    if (recurrenceRule.includes('BYDAY=')) {
      // Manejar días específicos (weekdays)
      const daysMatch = recurrenceRule.match(/BYDAY=([A-Z,]+)/);
      if (daysMatch) {
        const days = daysMatch[1].split(',');
        const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const allowedDays = days.map(d => dayMap[d]);
        
        // Avanzar hasta encontrar el próximo día permitido
        do {
          nextDate.setDate(nextDate.getDate() + 1);
        } while (!allowedDays.includes(nextDate.getDay()));
      }
    } else {
      nextDate.setDate(nextDate.getDate() + 7);
    }
  } else if (recurrenceRule.includes('FREQ=MONTHLY')) {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (recurrenceRule.includes('FREQ=YEARLY')) {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  }
  
  return nextDate;
}

/**
 * Completa una tarea recurrente (crea la siguiente ocurrencia)
 */
export async function completeRecurringTask(id: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Obtener la tarea actual
  const task = await db.task.findUnique({
    where: { id },
    include: { reminders: { where: { deletedAt: null } } },
  });
  
  if (!task || !task.isRecurring || !task.recurrenceRule || !task.dueDate) {
    // Si no es recurrente, completar normalmente
    return completeTask(id);
  }
  
  // Calcular próxima fecha
  const nextDueDate = getNextOccurrence(task.dueDate, task.recurrenceRule);
  
  // Verificar si hemos llegado al fin de la recurrencia
  if (task.recurrenceEnd && nextDueDate > task.recurrenceEnd) {
    // Completar definitivamente
    return completeTask(id);
  }
  
  // Actualizar la tarea con la nueva fecha (no marcar como completada)
  const updatedTask = await db.task.update({
    where: { id },
    data: {
      dueDate: nextDueDate,
      syncVersion: { increment: 1 },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
  });
  
  // Actualizar el reminder existente
  if (task.reminders.length > 0) {
    const reminder = task.reminders[0];
    await db.reminder.update({
      where: { id: reminder.id },
      data: {
        fireAt: nextDueDate,
        lastNotifiedAt: null,
        dismissed: false,
        firedAt: null,
      },
    });
    
    // Actualizar la cola de notificaciones
    await db.nextNotification.updateMany({
      where: { reminderId: reminder.id },
      data: { nextFireAt: nextDueDate },
    });
  }
  
  // Registrar evento
  await db.taskEvent.create({
    data: {
      taskId: id,
      eventType: 'recurring_completed',
      eventData: JSON.stringify({ previousDate: task.dueDate, nextDate: nextDueDate }),
      deviceId,
    },
  });
  
  logger.info(`Recurring task completed, next: ${nextDueDate}`);
  return updatedTask;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBTAREAS (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Actualiza el estado de una subtarea
 */
export async function updateSubtask(taskId: string, subtaskId: string, done: boolean) {
  const db = getDatabase();
  
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || !task.subtasks) {
    throw new Error('Task or subtasks not found');
  }
  
  const subtasks: Subtask[] = JSON.parse(task.subtasks);
  const subtask = subtasks.find(s => s.id === subtaskId);
  
  if (!subtask) {
    throw new Error('Subtask not found');
  }
  
  subtask.done = done;
  
  const updatedTask = await db.task.update({
    where: { id: taskId },
    data: {
      subtasks: JSON.stringify(subtasks),
      syncVersion: { increment: 1 },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
  });
  
  logger.debug(`Subtask ${subtaskId} marked as ${done ? 'done' : 'not done'}`);
  return updatedTask;
}

// ═══════════════════════════════════════════════════════════════════════════
// ETIQUETAS / TAGS (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las etiquetas
 */
export async function getAllTags() {
  const db = getDatabase();
  return db.tag.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Crea una nueva etiqueta
 */
export async function createTag(name: string, color?: string) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  const tag = await db.tag.create({
    data: {
      name: name.toLowerCase().trim(),
      color: color || '#6B7280',
      deviceId,
    },
  });
  
  logger.info(`Tag created: ${tag.name}`);
  return tag;
}

/**
 * Elimina una etiqueta
 */
export async function deleteTag(id: string) {
  const db = getDatabase();
  return db.tag.delete({ where: { id } });
}

/**
 * Obtiene tareas por etiqueta
 */
export async function getTasksByTag(tagName: string) {
  const db = getDatabase();
  
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
      tags: { contains: tagName },
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: [
      { completedAt: 'asc' },
      { dueDate: 'asc' },
    ],
  });
  
  return tasks;
}

// ═══════════════════════════════════════════════════════════════════════════
// BÚSQUEDA DE TAREAS (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca tareas por texto en título y notas
 */
export async function searchTasks(query: string) {
  const db = getDatabase();
  const searchTerm = query.toLowerCase().trim();
  
  if (!searchTerm) {
    return [];
  }
  
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
      OR: [
        { title: { contains: searchTerm } },
        { notes: { contains: searchTerm } },
        { waitingForNote: { contains: searchTerm } },
      ],
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: [
      { completedAt: 'asc' },
      { dueDate: 'asc' },
    ],
  });
  
  logger.debug(`Search found ${tasks.length} tasks for: "${query}"`);
  return tasks;
}

/**
 * Obtiene tareas por proyecto
 */
export async function getTasksByProject(projectId: string | null) {
  const db = getDatabase();
  
  return db.task.findMany({
    where: {
      deletedAt: null,
      projectId: projectId,
    },
    include: {
      project: true,
      reminders: { where: { deletedAt: null } },
    },
    orderBy: [
      { completedAt: 'asc' },
      { sortOrder: 'asc' },
      { dueDate: 'asc' },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTIÓN DE PROYECTOS (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todos los proyectos
 */
export async function getAllProjects() {
  const db = getDatabase();
  
  const projects = await db.project.findMany({
    where: {
      deletedAt: null,
      isArchived: false,
    },
    include: {
      _count: {
        select: {
          tasks: {
            where: {
              deletedAt: null,
              completedAt: null,
            },
          },
        },
      },
    },
    orderBy: [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });
  
  logger.debug(`Fetched ${projects.length} projects`);
  return projects;
}

/**
 * Crea un nuevo proyecto
 */
export async function createProject(input: { name: string; color?: string; icon?: string }) {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  // Obtener el mayor sortOrder
  const maxSort = await db.project.aggregate({
    _max: { sortOrder: true },
  });
  
  const project = await db.project.create({
    data: {
      name: input.name,
      color: input.color || '#3B82F6',
      icon: input.icon,
      sortOrder: (maxSort._max.sortOrder || 0) + 1,
      deviceId,
    },
  });
  
  logger.info(`Project created: ${project.id} - ${project.name}`);
  return project;
}

/**
 * Actualiza un proyecto
 */
export async function updateProject(id: string, input: { name?: string; color?: string; icon?: string }) {
  const db = getDatabase();
  
  const project = await db.project.update({
    where: { id },
    data: {
      name: input.name,
      color: input.color,
      icon: input.icon,
      syncVersion: { increment: 1 },
    },
  });
  
  logger.info(`Project updated: ${project.id}`);
  return project;
}

/**
 * Archiva un proyecto
 */
export async function archiveProject(id: string) {
  const db = getDatabase();
  
  const project = await db.project.update({
    where: { id },
    data: {
      isArchived: true,
      syncVersion: { increment: 1 },
    },
  });
  
  logger.info(`Project archived: ${project.id}`);
  return project;
}

/**
 * Elimina un proyecto (soft delete)
 */
export async function deleteProject(id: string) {
  const db = getDatabase();
  
  // Primero, desasociar tareas del proyecto
  await db.task.updateMany({
    where: { projectId: id },
    data: { projectId: null },
  });
  
  const project = await db.project.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      syncVersion: { increment: 1 },
    },
  });
  
  logger.info(`Project deleted: ${project.id}`);
  return project;
}
