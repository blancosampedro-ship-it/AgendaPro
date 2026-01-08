/**
 * Holiday Service - Gestión de festivos de Madrid Capital
 * 
 * Incluye:
 * - Festivos nacionales de España
 * - Festivos de la Comunidad de Madrid
 * - Festivos locales de Madrid Capital
 * - Cálculo automático de Semana Santa (festivos móviles)
 */

import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';
import { getDeviceId } from '../utils/deviceId';

// ═══════════════════════════════════════════════════════════════════════════
// FESTIVOS FIJOS DE MADRID CAPITAL (Recurrentes cada año)
// ═══════════════════════════════════════════════════════════════════════════
const FIXED_HOLIDAYS_MADRID: Array<{ month: number; day: number; name: string }> = [
  // Festivos Nacionales
  { month: 1, day: 1, name: 'Año Nuevo' },
  { month: 1, day: 6, name: 'Reyes Magos' },
  { month: 5, day: 1, name: 'Día del Trabajo' },
  { month: 8, day: 15, name: 'Asunción de la Virgen' },
  { month: 10, day: 12, name: 'Fiesta Nacional de España' },
  { month: 11, day: 1, name: 'Todos los Santos' },
  { month: 12, day: 6, name: 'Día de la Constitución' },
  { month: 12, day: 8, name: 'Inmaculada Concepción' },
  { month: 12, day: 25, name: 'Navidad' },
  
  // Festivos Comunidad de Madrid
  { month: 5, day: 2, name: 'Comunidad de Madrid' },
  
  // Festivos Locales Madrid Capital
  { month: 5, day: 15, name: 'San Isidro' },
  { month: 11, day: 9, name: 'Virgen de la Almudena' },
];

// ═══════════════════════════════════════════════════════════════════════════
// CÁLCULO DE PASCUA (Algoritmo de Computus)
// Semana Santa se calcula a partir de la fecha de Pascua
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula la fecha de Domingo de Pascua para un año dado
 * Usando el algoritmo anónimo de Computus (Meeus/Jones/Butcher)
 */
function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month - 1, day);
}

/**
 * Calcula los festivos móviles de Semana Santa para un año dado
 * En España (Madrid): Jueves Santo y Viernes Santo son festivos
 */
function getHolyWeekHolidays(year: number): Array<{ date: Date; name: string }> {
  const easter = calculateEasterSunday(year);
  
  // Jueves Santo = Pascua - 3 días
  const holyThursday = new Date(easter);
  holyThursday.setDate(easter.getDate() - 3);
  
  // Viernes Santo = Pascua - 2 días
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  
  return [
    { date: holyThursday, name: 'Jueves Santo' },
    { date: goodFriday, name: 'Viernes Santo' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PÚBLICAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inicializa los festivos de Madrid Capital
 * - Carga los festivos fijos como recurrentes
 * - Calcula y carga Semana Santa para el año actual y siguiente
 */
export async function initializeMadridHolidays(): Promise<void> {
  try {
    const db = getDatabase();
    const deviceId = getDeviceId();
    
    // Verificar si ya hay festivos cargados
    const existingCount = await db.holiday.count();
    
    if (existingCount > 0) {
      logger.info(`Ya existen ${existingCount} festivos en la BD. Verificando actualizaciones...`);
      await ensureHolyWeekHolidays();
      return;
    }
    
    logger.info('Inicializando festivos de Madrid Capital...');
    
    // 1. Cargar festivos fijos (recurrentes)
    const fixedHolidays = FIXED_HOLIDAYS_MADRID.map(h => ({
      id: `fixed-${h.month}-${h.day}`,
      name: h.name,
      date: new Date(2000, h.month - 1, h.day), // Año base, solo importa mes/día
      recurring: true,
      deviceId,
    }));
    
    // 2. Cargar Semana Santa del año actual y siguiente
    const currentYear = new Date().getFullYear();
    const holyWeekHolidays: Array<{
      id: string;
      name: string;
      date: Date;
      recurring: boolean;
      deviceId: string;
    }> = [];
    
    for (const year of [currentYear, currentYear + 1]) {
      const holyWeek = getHolyWeekHolidays(year);
      holyWeek.forEach(h => {
        holyWeekHolidays.push({
          id: `holyweek-${year}-${h.name.replace(/\s/g, '-').toLowerCase()}`,
          name: `${h.name} ${year}`,
          date: h.date,
          recurring: false, // Semana Santa cambia de fecha cada año
          deviceId,
        });
      });
    }
    
    // Insertar todos los festivos
    const allHolidays = [...fixedHolidays, ...holyWeekHolidays];
    
    for (const holiday of allHolidays) {
      await db.holiday.upsert({
        where: { id: holiday.id },
        update: { name: holiday.name, date: holiday.date },
        create: holiday,
      });
    }
    
    logger.info(`✅ Cargados ${allHolidays.length} festivos de Madrid Capital`);
    logger.info(`   - ${fixedHolidays.length} festivos fijos (recurrentes)`);
    logger.info(`   - ${holyWeekHolidays.length} festivos de Semana Santa`);
    
  } catch (error) {
    logger.error('Error inicializando festivos:', error);
  }
}

/**
 * Asegura que existen los festivos de Semana Santa para el año actual y siguiente
 * Llamar periódicamente (ej: al iniciar la app cada año)
 */
export async function ensureHolyWeekHolidays(): Promise<void> {
  try {
    const db = getDatabase();
    const deviceId = getDeviceId();
    const currentYear = new Date().getFullYear();
    
    for (const year of [currentYear, currentYear + 1]) {
      const holyWeek = getHolyWeekHolidays(year);
      
      for (const h of holyWeek) {
        const id = `holyweek-${year}-${h.name.replace(/\s/g, '-').toLowerCase()}`;
        const existing = await db.holiday.findUnique({ where: { id } });
        
        if (!existing) {
          await db.holiday.create({
            data: {
              id,
              name: `${h.name} ${year}`,
              date: h.date,
              recurring: false,
              deviceId,
            },
          });
          logger.info(`➕ Añadido ${h.name} ${year}: ${h.date.toLocaleDateString('es-ES')}`);
        }
      }
    }
  } catch (error) {
    logger.error('Error asegurando festivos de Semana Santa:', error);
  }
}

/**
 * Obtiene todos los festivos (para mostrar en UI)
 */
export async function getAllHolidays(): Promise<Array<{
  id: string;
  name: string;
  date: Date;
  recurring: boolean;
}>> {
  const db = getDatabase();
  return db.holiday.findMany({
    orderBy: [
      { recurring: 'desc' },
      { date: 'asc' },
    ],
  });
}

/**
 * Añade un festivo personalizado
 */
export async function addCustomHoliday(
  name: string,
  date: Date,
  recurring: boolean = false
): Promise<void> {
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  await db.holiday.create({
    data: {
      name,
      date,
      recurring,
      deviceId,
    },
  });
  
  logger.info(`➕ Festivo personalizado añadido: ${name}`);
}

/**
 * Elimina un festivo
 */
export async function removeHoliday(id: string): Promise<void> {
  const db = getDatabase();
  await db.holiday.delete({ where: { id } });
  logger.info(`🗑️ Festivo eliminado: ${id}`);
}

/**
 * Verifica si una fecha es festivo
 */
export async function isHolidayDate(date: Date): Promise<{ isHoliday: boolean; name?: string }> {
  const db = getDatabase();
  
  // Buscar festivos recurrentes (comparar mes/día)
  const month = date.getMonth();
  const day = date.getDate();
  
  const holidays = await db.holiday.findMany();
  
  for (const h of holidays) {
    const hDate = new Date(h.date);
    
    if (h.recurring) {
      // Festivo recurrente: comparar solo mes y día
      if (hDate.getMonth() === month && hDate.getDate() === day) {
        return { isHoliday: true, name: h.name };
      }
    } else {
      // Festivo específico: comparar fecha completa
      if (
        hDate.getFullYear() === date.getFullYear() &&
        hDate.getMonth() === month &&
        hDate.getDate() === day
      ) {
        return { isHoliday: true, name: h.name };
      }
    }
  }
  
  return { isHoliday: false };
}

/**
 * Obtiene el nombre del festivo si la fecha es festivo
 */
export async function getHolidayName(date: Date): Promise<string | null> {
  const result = await isHolidayDate(date);
  return result.isHoliday ? result.name ?? null : null;
}

/**
 * Calcula Semana Santa para un rango de años (útil para planificación)
 */
export function getHolyWeekDatesForYears(startYear: number, endYear: number): Array<{
  year: number;
  holyThursday: Date;
  goodFriday: Date;
  easterSunday: Date;
}> {
  const results = [];
  
  for (let year = startYear; year <= endYear; year++) {
    const easter = calculateEasterSunday(year);
    const holyThursday = new Date(easter);
    holyThursday.setDate(easter.getDate() - 3);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    
    results.push({
      year,
      holyThursday,
      goodFriday,
      easterSunday: easter,
    });
  }
  
  return results;
}
