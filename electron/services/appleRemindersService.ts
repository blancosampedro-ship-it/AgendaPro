/**
 * Apple Reminders Import Service
 * Importa recordatorios desde la app Recordatorios de macOS
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { getDatabase } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { getDeviceId } from '../utils/deviceId';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

interface AppleReminder {
  name: string;
  body: string | null;
  dueDate: string | null;
  priority: number;
  completed: boolean;
  listName: string;
}

/**
 * Obtiene recordatorios pendientes usando JXA (JavaScript for Automation)
 * Es más rápido que AppleScript tradicional
 */
async function getAppleReminders(): Promise<AppleReminder[]> {
  const scriptPath = path.join(os.tmpdir(), 'get_reminders.js');
  
  // JXA es más rápido que AppleScript
  const jxaScript = `
ObjC.import('stdlib');
var Reminders = Application("Reminders");
var result = [];
var lists = Reminders.lists();
for (var i = 0; i < lists.length; i++) {
  try {
    var list = lists[i];
    var listName = list.name();
    var rems = list.reminders.whose({completed: false})();
    for (var j = 0; j < rems.length; j++) {
      try {
        var r = rems[j];
        var dueDate = "";
        try { 
          var d = r.dueDate();
          if (d) dueDate = d.toISOString(); 
        } catch(e) {}
        var body = "";
        try { body = r.body() || ""; } catch(e) {}
        result.push({
          name: r.name(),
          body: body,
          dueDate: dueDate,
          priority: r.priority() || 0,
          completed: false,
          listName: listName
        });
      } catch(e) {}
    }
  } catch(e) {}
}
JSON.stringify(result);
`;

  try {
    fs.writeFileSync(scriptPath, jxaScript, 'utf8');
    
    logger.info('Ejecutando JXA script para obtener recordatorios...');
    
    // Timeout de 2 minutos porque puede tardar con muchos recordatorios
    const { stdout, stderr } = await execAsync(`osascript -l JavaScript "${scriptPath}"`, {
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
    
    // Limpiar archivo temporal
    try { fs.unlinkSync(scriptPath); } catch {}
    
    if (stderr) {
      logger.warn('JXA stderr:', stderr);
    }
    
    logger.info(`JXA output length: ${stdout.length}`);
    
    const reminders: AppleReminder[] = JSON.parse(stdout);
    logger.info(`Parsed ${reminders.length} reminders from Apple Reminders`);
    
    return reminders;
  } catch (error: any) {
    logger.error('Error getting Apple Reminders:', error);
    try { fs.unlinkSync(scriptPath); } catch {}
    
    const errorMsg = error.stderr || error.message || 'Error desconocido';
    if (errorMsg.includes('-1743') || errorMsg.includes('not authorized')) {
      throw new Error('No tienes autorización para acceder a Recordatorios (-1743)');
    }
    if (error.killed) {
      throw new Error('La operación tardó demasiado. Intenta cerrar y abrir Recordatorios.');
    }
    throw new Error(`Error obteniendo recordatorios: ${errorMsg.substring(0, 200)}`);
  }
}

/**
 * Convierte prioridad de Apple (0-9) a AgendaPro (1-3)
 * Apple: 0=none, 1-4=high, 5=medium, 6-9=low
 * AgendaPro: 1=high, 2=medium, 3=low
 */
function convertPriority(applePriority: number): number {
  if (applePriority === 0) return 3; // Normal
  if (applePriority <= 4) return 1; // Alta
  if (applePriority === 5) return 2; // Media
  return 3; // Baja → Normal
}

/**
 * Importa los recordatorios de Apple a AgendaPro
 */
export async function importAppleReminders(options: {
  includeCompleted?: boolean;
} = {}): Promise<{ imported: number; skipped: number; errors: number }> {
  
  logger.info('Starting Apple Reminders import...');
  
  const reminders = await getAppleReminders();
  logger.info(`Found ${reminders.length} pending reminders to import`);
  
  const db = getDatabase();
  const deviceId = getDeviceId();
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const reminder of reminders) {
    try {
      // Parsear fecha
      let dueDate: Date | null = null;
      if (reminder.dueDate) {
        dueDate = new Date(reminder.dueDate);
        if (isNaN(dueDate.getTime())) {
          dueDate = null;
        }
      }
      
      // Crear tarea
      const taskId = uuidv4();
      const task = await db.task.create({
        data: {
          id: taskId,
          title: reminder.name,
          notes: reminder.body,
          dueDate,
          priority: convertPriority(reminder.priority),
          completedAt: reminder.completed ? new Date() : null,
          deviceId,
          tags: reminder.listName ? JSON.stringify([reminder.listName]) : null,
        },
      });
      
      // Si tiene fecha, crear recordatorio
      if (dueDate && !reminder.completed) {
        const reminderId = uuidv4();
        await db.reminder.create({
          data: {
            id: reminderId,
            taskId: task.id,
            type: 'due',
            fireAt: dueDate,
            dismissed: false,
            deviceId,
          },
        });
        
        // Añadir a cola de notificaciones
        await db.nextNotification.create({
          data: {
            reminderId,
            nextFireAt: dueDate,
          },
        });
      }
      
      imported++;
      logger.debug(`Imported: ${reminder.name}`);
      
    } catch (error) {
      logger.error(`Error importing reminder "${reminder.name}":`, error);
      errors++;
    }
  }
  
  logger.info(`Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);
  
  return { imported, skipped, errors };
}

/**
 * Cuenta cuántos recordatorios hay en Apple Reminders
 */
export async function countAppleReminders(): Promise<{ total: number; pending: number }> {
  const reminders = await getAppleReminders();
  const pending = reminders.filter(r => !r.completed).length;
  return { total: reminders.length, pending };
}
