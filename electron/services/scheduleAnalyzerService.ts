/**
 * Schedule Analyzer Service
 * Analiza conflictos de horarios, carga de días y sugiere alternativas
 * Incluye lógica para evitar fines de semana y festivos
 */

import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface TaskSummary {
  id: string;
  title: string;
  dueDate: Date;
  priority: number;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: TaskSummary[];
}

export interface DayLoad {
  date: string; // YYYY-MM-DD
  taskCount: number;
  level: 'light' | 'moderate' | 'heavy';
  tasks: TaskSummary[];
}

export interface SuggestedSlot {
  date: Date;
  reason: string;
  dayLoad: 'light' | 'moderate' | 'heavy';
}

export interface ScheduleAnalysis {
  // Conflictos directos (misma hora)
  conflicts: ConflictResult;
  // Carga del día seleccionado
  dayLoad: DayLoad;
  // Sugerencias de horarios alternativos
  suggestions: SuggestedSlot[];
  // Advertencia general
  warning: string | null;
  // Advertencia de día no laborable
  nonWorkingDayWarning: string | null;
}

export interface WorkdaySettings {
  avoidWeekends: boolean;
  avoidHolidays: boolean;
  workingDaysStart: number; // 0=dom, 1=lun... 6=sáb
  workingDaysEnd: number;
}

// Configuración
const HEAVY_DAY_THRESHOLD = 5;   // 5+ tareas = día pesado
const MODERATE_DAY_THRESHOLD = 3; // 3-4 tareas = día moderado
const CONFLICT_WINDOW_MINUTES = 30; // Tareas a menos de 30 min se consideran conflicto

// Cache de configuración (se recarga cada 5 min)
let workdaySettingsCache: WorkdaySettings | null = null;
let holidaysCache: Date[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Carga la configuración de días laborables
 */
async function loadWorkdaySettings(): Promise<WorkdaySettings> {
  // TEMPORAL: Desactivar cache para debug
  // const now = Date.now();
  // if (workdaySettingsCache && (now - cacheTimestamp) < CACHE_TTL) {
  //   return workdaySettingsCache;
  // }
  
  try {
    const db = getDatabase();
    const settings = await db.settings.findUnique({ where: { id: 'main' } });
    
    logger.info('Raw settings from DB:', { 
      avoidWeekends: settings?.avoidWeekends,
      avoidHolidays: settings?.avoidHolidays,
      workingDaysStart: settings?.workingDaysStart,
      workingDaysEnd: settings?.workingDaysEnd,
    });
    
    // Los valores por defecto son true para evitar fines de semana/festivos
    // Si el campo es null (registro antiguo), usar el default true
    const avoidWeekends = settings?.avoidWeekends !== false; // true si es null, undefined o true
    const avoidHolidays = settings?.avoidHolidays !== false; // true si es null, undefined o true
    
    workdaySettingsCache = {
      avoidWeekends,
      avoidHolidays,
      workingDaysStart: settings?.workingDaysStart ?? 1,
      workingDaysEnd: settings?.workingDaysEnd ?? 5,
    };
    
    logger.info('Computed workday settings:', workdaySettingsCache);
    
    // Cargar festivos del año actual y siguiente
    const thisYear = new Date().getFullYear();
    const holidays = await db.holiday.findMany({
      where: {
        OR: [
          { recurring: true },
          {
            date: {
              gte: new Date(thisYear, 0, 1),
              lte: new Date(thisYear + 1, 11, 31),
            }
          }
        ]
      }
    });
    
    holidaysCache = holidays.map(h => new Date(h.date));
    cacheTimestamp = Date.now();
    
    logger.info(`Loaded ${holidaysCache.length} holidays`);
    
    return workdaySettingsCache;
  } catch (error) {
    logger.error('Error loading workday settings:', error);
    return {
      avoidWeekends: true,
      avoidHolidays: true,
      workingDaysStart: 1,
      workingDaysEnd: 5,
    };
  }
}

/**
 * Verifica si una fecha es fin de semana
 * SIEMPRE considera sábado (6) y domingo (0) como fin de semana
 * La configuración avoidWeekends controla si queremos evitarlos o no
 */
function isWeekend(date: Date, settings: WorkdaySettings): boolean {
  const day = date.getDay(); // 0=dom, 1=lun... 6=sáb
  
  // Sábado = 6, Domingo = 0
  const isSaturdayOrSunday = day === 0 || day === 6;
  
  // Si avoidWeekends está desactivado, no consideramos ningún día como "fin de semana a evitar"
  if (!settings.avoidWeekends) {
    logger.debug(`isWeekend: avoidWeekends is OFF, returning false`);
    return false;
  }
  
  logger.debug(`isWeekend check: day=${day} (${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][day]}), isSaturdayOrSunday=${isSaturdayOrSunday}`);
  return isSaturdayOrSunday;
}

/**
 * Verifica si una fecha es festivo
 */
function isHoliday(date: Date, settings: WorkdaySettings): boolean {
  if (!settings.avoidHolidays) return false;
  
  const dateStr = formatDateKey(date);
  
  for (const holiday of holidaysCache) {
    // Para festivos recurrentes, comparar solo mes y día
    const holidayStr = formatDateKey(holiday);
    if (dateStr === holidayStr) return true;
    
    // Comparar mes/día para festivos recurrentes
    if (date.getMonth() === holiday.getMonth() && 
        date.getDate() === holiday.getDate()) {
      return true;
    }
  }
  
  return false;
}

/**
 * Verifica si una fecha es día laborable
 */
export async function isWorkingDay(date: Date): Promise<boolean> {
  const settings = await loadWorkdaySettings();
  return !isWeekend(date, settings) && !isHoliday(date, settings);
}

/**
 * Obtiene el motivo por el que un día no es laborable
 */
async function getNonWorkingDayReason(date: Date): Promise<string | null> {
  const settings = await loadWorkdaySettings();
  
  if (isWeekend(date, settings)) {
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return `${dayNames[date.getDay()]} es fin de semana`;
  }
  
  if (isHoliday(date, settings)) {
    // Buscar nombre del festivo
    const db = getDatabase();
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);
    
    const holiday = await db.holiday.findFirst({
      where: {
        OR: [
          { date: { gte: dateStart, lte: dateEnd } },
          { recurring: true }
        ]
      }
    });
    
    if (holiday && holiday.date.getMonth() === date.getMonth() && 
        holiday.date.getDate() === date.getDate()) {
      return `Es festivo: ${holiday.name}`;
    }
    return 'Es día festivo';
  }
  
  return null;
}

/**
 * Encuentra el siguiente día laborable
 */
async function getNextWorkingDay(fromDate: Date, maxDays: number = 14): Promise<Date | null> {
  const settings = await loadWorkdaySettings();
  const checkDate = new Date(fromDate);
  
  for (let i = 1; i <= maxDays; i++) {
    checkDate.setDate(checkDate.getDate() + 1);
    
    if (!isWeekend(checkDate, settings) && !isHoliday(checkDate, settings)) {
      return new Date(checkDate);
    }
  }
  
  return null;
}

/**
 * Verifica si dos fechas son el mismo día
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Formatea fecha como YYYY-MM-DD
 */
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calcula la diferencia en minutos entre dos fechas
 */
function minutesDiff(date1: Date, date2: Date): number {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

/**
 * Determina el nivel de carga de un día
 */
function getDayLevel(taskCount: number): 'light' | 'moderate' | 'heavy' {
  if (taskCount >= HEAVY_DAY_THRESHOLD) return 'heavy';
  if (taskCount >= MODERATE_DAY_THRESHOLD) return 'moderate';
  return 'light';
}

/**
 * Obtiene las tareas de un día específico
 */
async function getTasksForDay(date: Date, excludeTaskId?: string): Promise<TaskSummary[]> {
  const db = getDatabase();
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
      ...(excludeTaskId ? { NOT: { id: excludeTaskId } } : {}),
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      priority: true,
    },
    orderBy: {
      dueDate: 'asc',
    },
  });
  
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate!,
    priority: t.priority,
  }));
}

/**
 * Encuentra conflictos de horario
 * Conflicto = tarea en el mismo día a menos de CONFLICT_WINDOW_MINUTES minutos
 */
async function findConflicts(
  targetDate: Date, 
  excludeTaskId?: string
): Promise<ConflictResult> {
  const dayTasks = await getTasksForDay(targetDate, excludeTaskId);
  
  const conflicts = dayTasks.filter(task => {
    const diff = minutesDiff(task.dueDate, targetDate);
    return diff < CONFLICT_WINDOW_MINUTES;
  });
  
  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Calcula la carga de un día
 */
async function getDayLoad(date: Date, excludeTaskId?: string): Promise<DayLoad> {
  const tasks = await getTasksForDay(date, excludeTaskId);
  
  return {
    date: formatDateKey(date),
    taskCount: tasks.length,
    level: getDayLevel(tasks.length),
    tasks,
  };
}

/**
 * Encuentra el siguiente hueco libre en un día
 */
function findNextFreeSlot(tasks: TaskSummary[], targetDate: Date): Date | null {
  if (tasks.length === 0) return targetDate;
  
  // Ordenar por hora
  const sortedTasks = [...tasks].sort((a, b) => 
    a.dueDate.getTime() - b.dueDate.getTime()
  );
  
  // Buscar hueco de al menos 1 hora
  for (let i = 0; i < sortedTasks.length; i++) {
    const currentEnd = new Date(sortedTasks[i].dueDate.getTime() + 60 * 60 * 1000); // +1 hora
    const nextStart = sortedTasks[i + 1]?.dueDate;
    
    if (!nextStart || minutesDiff(currentEnd, nextStart) >= 60) {
      // Hay hueco después de esta tarea
      const slot = new Date(currentEnd);
      // Si el hueco es después de las 20:00, no sugerir
      if (slot.getHours() < 20) {
        return slot;
      }
    }
  }
  
  // Si no hay hueco, sugerir 30 min después de la última
  const lastTask = sortedTasks[sortedTasks.length - 1];
  const afterLast = new Date(lastTask.dueDate.getTime() + 30 * 60 * 1000);
  
  if (afterLast.getHours() < 20) {
    return afterLast;
  }
  
  return null;
}

/**
 * Sugiere horarios alternativos
 * Ahora filtra fines de semana y festivos según configuración
 */
async function suggestAlternatives(
  targetDate: Date,
  excludeTaskId?: string
): Promise<SuggestedSlot[]> {
  const suggestions: SuggestedSlot[] = [];
  const db = getDatabase();
  const settings = await loadWorkdaySettings();
  
  logger.info('suggestAlternatives - Settings:', { 
    avoidWeekends: settings.avoidWeekends,
    avoidHolidays: settings.avoidHolidays,
    targetDate: targetDate.toISOString(),
    targetDay: targetDate.getDay()
  });
  
  // 1. Siguiente hueco libre en el mismo día (solo si es día laborable)
  const targetIsWorkingDay = !isWeekend(targetDate, settings) && !isHoliday(targetDate, settings);
  
  if (targetIsWorkingDay) {
    const sameDayTasks = await getTasksForDay(targetDate, excludeTaskId);
    const sameDaySlot = findNextFreeSlot(sameDayTasks, targetDate);
    
    if (sameDaySlot && !isSameHour(sameDaySlot, targetDate)) {
      suggestions.push({
        date: sameDaySlot,
        reason: 'Siguiente hueco libre hoy',
        dayLoad: getDayLevel(sameDayTasks.length),
      });
    }
  }
  
  // 2. Buscar días cercanos con menos carga (próximos 14 días, solo laborables)
  let foundLightDay = false;
  for (let i = 1; i <= 14 && !foundLightDay; i++) {
    const checkDate = new Date(targetDate);
    checkDate.setDate(checkDate.getDate() + i);
    checkDate.setHours(targetDate.getHours(), targetDate.getMinutes(), 0, 0);
    
    const dayNum = checkDate.getDay();
    const isWknd = isWeekend(checkDate, settings);
    const isHoli = isHoliday(checkDate, settings);
    
    logger.debug(`Checking day ${i}: ${getDayName(checkDate)} (${dayNum}), isWeekend=${isWknd}, isHoliday=${isHoli}`);
    
    // Saltar fines de semana y festivos
    if (isWknd || isHoli) {
      logger.debug(`  -> Skipping ${getDayName(checkDate)}`);
      continue;
    }
    
    const dayLoad = await getDayLoad(checkDate, excludeTaskId);
    
    // Solo sugerir si es un día más ligero
    if (dayLoad.level === 'light') {
      suggestions.push({
        date: checkDate,
        reason: `${getDayName(checkDate)} tiene pocas tareas (${dayLoad.taskCount})`,
        dayLoad: dayLoad.level,
      });
      foundLightDay = true;
    }
  }
  
  // 3. Si el día actual es fin de semana/festivo, sugerir el siguiente día laborable
  if (!targetIsWorkingDay) {
    const nextWorking = await getNextWorkingDay(targetDate);
    if (nextWorking) {
      nextWorking.setHours(targetDate.getHours(), targetDate.getMinutes(), 0, 0);
      const dayLoad = await getDayLoad(nextWorking, excludeTaskId);
      
      suggestions.push({
        date: nextWorking,
        reason: `Siguiente día laborable (${getDayName(nextWorking)})`,
        dayLoad: dayLoad.level,
      });
    }
  }
  
  // 4. Misma hora mañana (si el día actual está muy cargado y mañana es laborable)
  const sameDayTasks = await getTasksForDay(targetDate, excludeTaskId);
  if (sameDayTasks.length >= HEAVY_DAY_THRESHOLD) {
    const tomorrow = new Date(targetDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowIsWeekend = isWeekend(tomorrow, settings);
    const tomorrowIsHoliday = isHoliday(tomorrow, settings);
    
    logger.debug(`Section 4 - Tomorrow check: ${getDayName(tomorrow)}, isWeekend=${tomorrowIsWeekend}, isHoliday=${tomorrowIsHoliday}`);
    
    // Si mañana no es laborable, buscar siguiente día laborable
    let nextDay: Date | null = null;
    
    if (!tomorrowIsWeekend && !tomorrowIsHoliday) {
      // Mañana es laborable, usarlo
      nextDay = tomorrow;
    } else {
      // Mañana NO es laborable, buscar el siguiente día que sí lo sea
      const nextWorking = await getNextWorkingDay(targetDate);
      if (nextWorking) {
        nextDay = nextWorking;
        logger.debug(`  -> Tomorrow not working, next working day: ${getDayName(nextDay)}`);
      }
    }
    
    if (nextDay) {
      nextDay.setHours(targetDate.getHours(), targetDate.getMinutes(), 0, 0);
      const nextDayLoad = await getDayLoad(nextDay, excludeTaskId);
      
      // Verificar que realmente es un día laborable (doble check)
      const nextDayIsWorkingDay = !isWeekend(nextDay, settings) && !isHoliday(nextDay, settings);
      
      if (nextDayIsWorkingDay && nextDayLoad.level !== 'heavy') {
        const dayName = getDayName(nextDay);
        // Es mañana si es exactamente el día siguiente
        const isTomorrow = nextDay.toDateString() === tomorrow.toDateString();
        suggestions.push({
          date: nextDay,
          reason: isTomorrow 
            ? `Mañana está más tranquilo (${nextDayLoad.taskCount} tareas)`
            : `${dayName} está más tranquilo (${nextDayLoad.taskCount} tareas)`,
          dayLoad: nextDayLoad.level,
        });
      }
    }
  }
  
  return suggestions.slice(0, 3); // Máximo 3 sugerencias
}

/**
 * Verifica si dos fechas tienen la misma hora (ignorando minutos)
 */
function isSameHour(date1: Date, date2: Date): boolean {
  return (
    isSameDay(date1, date2) &&
    date1.getHours() === date2.getHours()
  );
}

/**
 * Obtiene el nombre del día
 */
function getDayName(date: Date): string {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
}

/**
 * Analiza el horario completo para una fecha/hora propuesta
 */
export async function analyzeSchedule(
  proposedDate: Date | string,
  excludeTaskId?: string
): Promise<ScheduleAnalysis> {
  const targetDate = typeof proposedDate === 'string' 
    ? new Date(proposedDate) 
    : proposedDate;
  
  logger.info('scheduleAnalyzer', 'Analyzing schedule', { 
    targetDate: targetDate.toISOString(),
    excludeTaskId 
  });
  
  // Ejecutar análisis en paralelo
  const [conflicts, dayLoad, suggestions, nonWorkingReason] = await Promise.all([
    findConflicts(targetDate, excludeTaskId),
    getDayLoad(targetDate, excludeTaskId),
    suggestAlternatives(targetDate, excludeTaskId),
    getNonWorkingDayReason(targetDate),
  ]);
  
  // Generar advertencia
  let warning: string | null = null;
  
  if (conflicts.hasConflicts) {
    const conflictTitles = conflicts.conflicts.map(c => c.title).join(', ');
    warning = `Conflicto de horario con: ${conflictTitles}`;
  } else if (dayLoad.level === 'heavy') {
    warning = `El ${getDayName(targetDate)} ya tiene ${dayLoad.taskCount} tareas programadas`;
  } else if (dayLoad.level === 'moderate') {
    warning = `El ${getDayName(targetDate)} tiene ${dayLoad.taskCount} tareas`;
  }
  
  return {
    conflicts,
    dayLoad,
    suggestions,
    warning,
    nonWorkingDayWarning: nonWorkingReason,
  };
}

/**
 * Verificación rápida de conflictos (sin sugerencias)
 */
export async function quickConflictCheck(
  proposedDate: Date | string,
  excludeTaskId?: string
): Promise<ConflictResult> {
  const targetDate = typeof proposedDate === 'string' 
    ? new Date(proposedDate) 
    : proposedDate;
  
  return findConflicts(targetDate, excludeTaskId);
}

/**
 * Obtiene un análisis de la semana completa
 */
export async function getWeekAnalysis(startDate?: Date): Promise<DayLoad[]> {
  const start = startDate || new Date();
  start.setHours(0, 0, 0, 0);
  
  const weekAnalysis: DayLoad[] = [];
  
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(start);
    checkDate.setDate(checkDate.getDate() + i);
    
    const dayLoad = await getDayLoad(checkDate);
    weekAnalysis.push(dayLoad);
  }
  
  return weekAnalysis;
}

/**
 * Detecta todos los conflictos en el calendario
 */
export async function detectAllConflicts(): Promise<Array<{
  date: string;
  conflictingTasks: TaskSummary[];
}>> {
  const db = getDatabase();
  
  // Obtener todas las tareas pendientes con fecha
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      dueDate: { not: null },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      priority: true,
    },
    orderBy: {
      dueDate: 'asc',
    },
  });
  
  // Agrupar por día
  const tasksByDay = new Map<string, TaskSummary[]>();
  
  for (const task of tasks) {
    if (!task.dueDate) continue;
    
    const dayKey = formatDateKey(task.dueDate);
    const dayTasks = tasksByDay.get(dayKey) || [];
    dayTasks.push({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
    });
    tasksByDay.set(dayKey, dayTasks);
  }
  
  // Buscar conflictos dentro de cada día
  const allConflicts: Array<{ date: string; conflictingTasks: TaskSummary[] }> = [];
  
  for (const [date, dayTasks] of tasksByDay) {
    if (dayTasks.length < 2) continue;
    
    // Ordenar por hora
    const sorted = dayTasks.sort((a, b) => 
      a.dueDate.getTime() - b.dueDate.getTime()
    );
    
    // Buscar pares en conflicto
    const conflicting: TaskSummary[] = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      
      if (minutesDiff(current.dueDate, next.dueDate) < CONFLICT_WINDOW_MINUTES) {
        if (!conflicting.includes(current)) conflicting.push(current);
        if (!conflicting.includes(next)) conflicting.push(next);
      }
    }
    
    if (conflicting.length > 0) {
      allConflicts.push({ date, conflictingTasks: conflicting });
    }
  }
  
  return allConflicts;
}
