/**
 * ExportService - Exportación e importación de datos
 * Fase 6: Exportar/importar JSON, validación de datos
 */

import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../database/connection';
import { logger } from '../utils/logger';

interface ExportData {
  version: string;
  exportedAt: string;
  deviceId: string;
  data: {
    projects: any[];
    tasks: any[];
    tags: any[];
    reminders: any[];
  };
  stats: {
    projectCount: number;
    taskCount: number;
    tagCount: number;
    reminderCount: number;
  };
}

interface ImportResult {
  success: boolean;
  message: string;
  imported?: {
    projects: number;
    tasks: number;
    tags: number;
    reminders: number;
    subtasks: number;
  };
  errors?: string[];
}

/**
 * Exportar todos los datos a JSON
 */
export async function exportToJSON(options?: {
  includeCompleted?: boolean;
  projectIds?: string[];
}): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const db = getDatabase();
    const deviceId = require('../utils/deviceId').getDeviceId();
    
    // Construir filtros
    const taskWhere: any = {};
    const projectWhere: any = {};
    
    if (!options?.includeCompleted) {
      taskWhere.completedAt = null;
    }
    
    if (options?.projectIds && options.projectIds.length > 0) {
      taskWhere.projectId = { in: options.projectIds };
      projectWhere.id = { in: options.projectIds };
    }
    
    // Obtener todos los datos
    const [projects, tasks, tags, reminders] = await Promise.all([
      db.project.findMany({
        where: projectWhere,
        orderBy: { createdAt: 'asc' },
      }),
      db.task.findMany({
        where: taskWhere,
        include: {
          reminders: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.tag.findMany({
        orderBy: { name: 'asc' },
      }),
      db.reminder.findMany({
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    
    // Limpiar datos de relaciones para el export
    const cleanTasks = tasks.map(t => {
      const { reminders: _reminders, ...taskData } = t;
      return taskData;
    });
    
    const exportData: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      deviceId,
      data: {
        projects,
        tasks: cleanTasks,
        tags,
        reminders,
      },
      stats: {
        projectCount: projects.length,
        taskCount: cleanTasks.length,
        tagCount: tags.length,
        reminderCount: reminders.length,
      },
    };
    
    // Mostrar diálogo para guardar
    const result = await dialog.showSaveDialog({
      title: 'Exportar datos de AgendaPro',
      defaultPath: path.join(
        app.getPath('documents'),
        `AgendaPro_Export_${new Date().toISOString().split('T')[0]}.json`
      ),
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Exportación cancelada' };
    }
    
    // Guardar archivo
    fs.writeFileSync(
      result.filePath,
      JSON.stringify(exportData, null, 2),
      'utf-8'
    );
    
    logger.info(`Datos exportados a: ${result.filePath}`);
    logger.info(`Stats: ${JSON.stringify(exportData.stats)}`);
    
    return { success: true, filePath: result.filePath };
  } catch (error: any) {
    logger.error('Error exporting data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Importar datos desde JSON
 */
export async function importFromJSON(options?: {
  merge?: boolean; // true = merge con datos existentes, false = reemplazar
}): Promise<ImportResult> {
  try {
    const db = getDatabase();
    const merge = options?.merge ?? true;
    const deviceId = require('../utils/deviceId').getDeviceId();
    
    // Mostrar diálogo para seleccionar archivo
    const result = await dialog.showOpenDialog({
      title: 'Importar datos a AgendaPro',
      defaultPath: app.getPath('documents'),
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
      properties: ['openFile'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Importación cancelada' };
    }
    
    const filePath = result.filePaths[0];
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    let importData: ExportData;
    try {
      importData = JSON.parse(fileContent);
    } catch {
      return { success: false, message: 'Archivo JSON inválido' };
    }
    
    // Validar estructura
    const validation = validateImportData(importData);
    if (!validation.valid) {
      return { 
        success: false, 
        message: 'Datos inválidos',
        errors: validation.errors,
      };
    }
    
    const errors: string[] = [];
    const imported = {
      projects: 0,
      tasks: 0,
      tags: 0,
      reminders: 0,
      subtasks: 0,
    };
    
    // Usar transacción para todo el import
    await db.$transaction(async (tx) => {
      // Si no es merge, limpiar datos existentes
      if (!merge) {
        await tx.reminder.deleteMany({});
        await tx.nextNotification.deleteMany({});
        await tx.taskEvent.deleteMany({});
        await tx.task.deleteMany({});
        await tx.tag.deleteMany({});
        await tx.project.deleteMany({});
      }
      
      // 1. Importar projects
      for (const project of importData.data.projects) {
        try {
          const existing = await tx.project.findUnique({ 
            where: { id: project.id } 
          });
          
          if (existing) {
            if (!merge) {
              await tx.project.update({
                where: { id: project.id },
                data: {
                  name: project.name,
                  color: project.color,
                  updatedAt: new Date(),
                },
              });
              imported.projects++;
            }
          } else {
            await tx.project.create({
              data: {
                id: project.id,
                name: project.name,
                color: project.color,
                deviceId: project.deviceId || deviceId,
                createdAt: new Date(project.createdAt),
                updatedAt: new Date(),
              },
            });
            imported.projects++;
          }
        } catch (e: any) {
          errors.push(`Project ${project.name}: ${e.message}`);
        }
      }
      
      // 2. Importar tags
      for (const tag of importData.data.tags) {
        try {
          const existing = await tx.tag.findUnique({ 
            where: { id: tag.id } 
          });
          
          if (existing) {
            if (!merge) {
              await tx.tag.update({
                where: { id: tag.id },
                data: {
                  name: tag.name,
                  color: tag.color,
                },
              });
              imported.tags++;
            }
          } else {
            await tx.tag.create({
              data: {
                id: tag.id,
                name: tag.name,
                color: tag.color || '#6B7280',
                deviceId: tag.deviceId || deviceId,
              },
            });
            imported.tags++;
          }
        } catch (e: any) {
          errors.push(`Tag ${tag.name}: ${e.message}`);
        }
      }
      
      // 3. Importar tasks
      for (const task of importData.data.tasks) {
        try {
          const existing = await tx.task.findUnique({ 
            where: { id: task.id } 
          });
          
          if (existing) {
            if (!merge) {
              await tx.task.update({
                where: { id: task.id },
                data: {
                  title: task.title,
                  notes: task.notes,
                  dueDate: task.dueDate ? new Date(task.dueDate) : null,
                  priority: task.priority,
                  completedAt: task.completedAt ? new Date(task.completedAt) : null,
                  projectId: task.projectId,
                  isRecurring: task.isRecurring || false,
                  recurrenceRule: task.recurrenceRule,
                  recurrenceEnd: task.recurrenceEnd ? new Date(task.recurrenceEnd) : null,
                  tags: task.tags,
                  subtasks: task.subtasks,
                  updatedAt: new Date(),
                },
              });
              imported.tasks++;
            }
          } else {
            await tx.task.create({
              data: {
                id: task.id,
                title: task.title,
                notes: task.notes,
                dueDate: task.dueDate ? new Date(task.dueDate) : null,
                priority: task.priority || 0,
                completedAt: task.completedAt ? new Date(task.completedAt) : null,
                projectId: task.projectId,
                isRecurring: task.isRecurring || false,
                recurrenceRule: task.recurrenceRule,
                recurrenceEnd: task.recurrenceEnd ? new Date(task.recurrenceEnd) : null,
                tags: task.tags,
                subtasks: task.subtasks,
                deviceId: task.deviceId || deviceId,
                createdAt: new Date(task.createdAt || new Date()),
                updatedAt: new Date(),
              },
            });
            imported.tasks++;
          }
        } catch (e: any) {
          errors.push(`Task ${task.title}: ${e.message}`);
        }
      }
      
      // 4. Importar reminders
      for (const reminder of importData.data.reminders) {
        try {
          const existing = await tx.reminder.findUnique({ 
            where: { id: reminder.id } 
          });
          
          if (!existing) {
            // Verificar que la tarea existe
            const taskExists = await tx.task.findUnique({ where: { id: reminder.taskId } });
            if (taskExists) {
              await tx.reminder.create({
                data: {
                  id: reminder.id,
                  taskId: reminder.taskId,
                  fireAt: new Date(reminder.fireAt),
                  type: reminder.type || 'due',
                  relativeMinutes: reminder.relativeMinutes,
                  deviceId: reminder.deviceId || deviceId,
                  createdAt: new Date(reminder.createdAt || new Date()),
                },
              });
              imported.reminders++;
            }
          }
        } catch (e: any) {
          errors.push(`Reminder: ${e.message}`);
        }
      }
    });
    
    logger.info(`Importación completada: ${JSON.stringify(imported)}`);
    if (errors.length > 0) {
      logger.warn(`Errores durante importación: ${errors.length}`);
    }
    
    return {
      success: true,
      message: `Importación completada${errors.length > 0 ? ' con algunos errores' : ''}`,
      imported,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    logger.error('Error importing data:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Validar estructura de datos de importación
 */
function validateImportData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.version) {
    errors.push('Falta versión del archivo');
  }
  
  if (!data.data) {
    errors.push('Falta objeto de datos');
    return { valid: false, errors };
  }
  
  if (!Array.isArray(data.data.projects)) {
    errors.push('Projects debe ser un array');
  }
  
  if (!Array.isArray(data.data.tasks)) {
    errors.push('Tasks debe ser un array');
  }
  
  if (!Array.isArray(data.data.tags)) {
    errors.push('Tags debe ser un array');
  }
  
  // Validar estructura de tasks
  if (Array.isArray(data.data.tasks)) {
    for (const task of data.data.tasks) {
      if (!task.id) errors.push(`Task sin ID: ${task.title || 'desconocida'}`);
      if (!task.title) errors.push(`Task sin título: ${task.id || 'desconocida'}`);
    }
  }
  
  // Validar estructura de projects
  if (Array.isArray(data.data.projects)) {
    for (const project of data.data.projects) {
      if (!project.id) errors.push(`Project sin ID: ${project.name || 'desconocido'}`);
      if (!project.name) errors.push(`Project sin nombre: ${project.id || 'desconocido'}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Obtener estadísticas de datos actuales
 */
export async function getDataStats(): Promise<{
  projects: number;
  tasks: number;
  completedTasks: number;
  tags: number;
  reminders: number;
}> {
  const db = getDatabase();
  
  const [projectCount, taskCount, completedCount, tagCount, reminderCount] = await Promise.all([
    db.project.count(),
    db.task.count(),
    db.task.count({ where: { completedAt: { not: null } } }),
    db.tag.count(),
    db.reminder.count(),
  ]);
  
  return {
    projects: projectCount,
    tasks: taskCount,
    completedTasks: completedCount,
    tags: tagCount,
    reminders: reminderCount,
  };
}
