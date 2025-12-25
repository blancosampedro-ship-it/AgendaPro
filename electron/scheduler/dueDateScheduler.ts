/**
 * DueDateScheduler - Motor de Vencimientos
 * 
 * Arquitectura:
 * - Single active timer al próximo nextFireAt
 * - Heartbeat cada 60s como safety net
 * - Catch-up al despertar del sistema
 * - Anti-duplicados con ventana de tolerancia ±2 minutos
 */

import { powerMonitor } from 'electron';
import { 
  getNextReminder, 
  getOverdueReminders, 
  lockReminder,
  markReminderAsNotified,
  wasRecentlyNotified,
} from '../services/reminderService';
import { sendTaskNotification } from '../notifications/notificationManager';
import { logger } from '../utils/logger';

// Configuración
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 segundos
const CATCH_UP_LIMIT = 10; // Máximo de notificaciones en catch-up
const MIN_TIMER_DELAY_MS = 1000; // Mínimo 1 segundo

// Estado del scheduler
let activeTimer: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let nextFireAt: Date | null = null;

/**
 * Inicia el scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    logger.warn('Scheduler already running');
    return;
  }
  
  isRunning = true;
  logger.info('═══════════════════════════════════════');
  logger.info('DueDateScheduler starting...');
  logger.info('═══════════════════════════════════════');
  
  // Iniciar heartbeat
  startHeartbeat();
  
  // Registrar listeners para sleep/wake
  setupPowerMonitor();
  
  // Programar primer timer
  scheduleNextTimer();
  
  logger.info('DueDateScheduler ready');
}

/**
 * Detiene el scheduler
 */
export function stopScheduler(): void {
  isRunning = false;
  
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  logger.info('DueDateScheduler stopped');
}

/**
 * Inicia el heartbeat (safety net)
 */
function startHeartbeat(): void {
  heartbeatInterval = setInterval(() => {
    logger.debug('[Heartbeat] Checking scheduler...');
    
    // Verificar si hay vencimientos perdidos
    checkOverdueReminders();
    
    // Si no hay timer activo, reprogramar
    if (!activeTimer && isRunning) {
      logger.debug('[Heartbeat] No active timer, scheduling...');
      scheduleNextTimer();
    }
  }, HEARTBEAT_INTERVAL_MS);
  
  logger.debug(`Heartbeat started (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
}

/**
 * Configura listeners para eventos de energía (sleep/wake)
 */
function setupPowerMonitor(): void {
  powerMonitor.on('resume', () => {
    logger.info('[PowerMonitor] System resumed from sleep');
    
    // Ejecutar catch-up después de despertar
    setTimeout(() => {
      logger.info('[PowerMonitor] Running catch-up...');
      checkOverdueReminders();
      scheduleNextTimer();
    }, 2000); // Esperar 2 segundos para estabilidad
  });
  
  powerMonitor.on('suspend', () => {
    logger.info('[PowerMonitor] System going to sleep');
  });
  
  logger.debug('PowerMonitor listeners registered');
}

/**
 * Programa el timer al próximo vencimiento
 */
async function scheduleNextTimer(): Promise<void> {
  // Cancelar timer existente
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  
  try {
    const next = await getNextReminder();
    
    if (!next) {
      logger.debug('No pending reminders in queue');
      nextFireAt = null;
      return;
    }
    
    nextFireAt = next.nextFireAt;
    const delayMs = Math.max(
      next.nextFireAt.getTime() - Date.now(),
      MIN_TIMER_DELAY_MS
    );
    
    logger.debug(`Next notification in ${Math.round(delayMs / 1000)}s: ${next.reminder.task.title}`);
    
    activeTimer = setTimeout(async () => {
      await processReminder(next.id, next.reminderId);
      scheduleNextTimer(); // Programar siguiente
    }, delayMs);
    
  } catch (error) {
    logger.error('Error scheduling next timer:', error);
  }
}

/**
 * Procesa un reminder (dispara notificación)
 */
async function processReminder(notificationId: string, reminderId: string): Promise<void> {
  logger.debug(`Processing reminder: ${reminderId}`);
  
  try {
    // 1. Verificar anti-duplicados
    const isDuplicate = await wasRecentlyNotified(reminderId);
    if (isDuplicate) {
      logger.debug(`Skipping duplicate for reminder ${reminderId}`);
      return;
    }
    
    // 2. Bloquear para evitar doble procesamiento
    await lockReminder(notificationId, 30000);
    
    // 3. Obtener datos actualizados del reminder con proyecto incluido
    const { getDatabase } = await import('../database/connection');
    const db = getDatabase();
    
    const reminder = await db.reminder.findUnique({
      where: { id: reminderId },
      include: { 
        task: {
          include: {
            project: true,
          },
        },
      },
    });
    
    if (!reminder || !reminder.task) {
      logger.warn(`Reminder ${reminderId} not found or task deleted`);
      return;
    }
    
    // 4. Verificar que la tarea no esté completada
    if (reminder.task.completedAt) {
      logger.debug(`Task already completed, skipping notification`);
      await markReminderAsNotified(reminderId);
      return;
    }
    
    // 5. Enviar notificación
    await sendTaskNotification(reminder.task, reminder);
    
    // 6. Marcar como notificado
    await markReminderAsNotified(reminderId);
    
    logger.info(`Notification sent for task: ${reminder.task.title}`);
    
  } catch (error) {
    logger.error(`Error processing reminder ${reminderId}:`, error);
  }
}

/**
 * Verifica y procesa reminders vencidos (catch-up)
 */
async function checkOverdueReminders(): Promise<void> {
  try {
    const overdueReminders = await getOverdueReminders(CATCH_UP_LIMIT);
    
    if (overdueReminders.length === 0) {
      return;
    }
    
    logger.info(`[Catch-up] Processing ${overdueReminders.length} overdue reminders`);
    
    for (const notification of overdueReminders) {
      await processReminder(notification.id, notification.reminderId);
    }
    
  } catch (error) {
    logger.error('Error in catch-up:', error);
  }
}

/**
 * Fuerza reprogramación del scheduler
 * Llamar después de crear/actualizar/snooze reminders
 */
export function reschedule(): void {
  if (isRunning) {
    logger.debug('Rescheduling...');
    scheduleNextTimer();
  }
}

/**
 * Obtiene el estado del scheduler
 */
export function getSchedulerStatus() {
  return {
    isRunning,
    nextFireAt,
    hasActiveTimer: activeTimer !== null,
  };
}
