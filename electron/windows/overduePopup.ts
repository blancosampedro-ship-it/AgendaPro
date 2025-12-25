/**
 * Overdue Tasks Popup - Professional Edition
 * Muestra tareas vencidas al iniciar la app con todas las opciones
 */

import { BrowserWindow, screen, ipcMain, nativeTheme } from 'electron';
import { logger } from '../utils/logger';
import { getMainWindow, showMainWindow } from './mainWindow';

let overdueWindow: BrowserWindow | null = null;

export interface OverdueTask {
  id: string;
  title: string;
  notes?: string | null;
  dueDate: Date | string;
  priority: number;
  projectName?: string | null;
  tags?: string[];
  subtasksTotal?: number;
  subtasksDone?: number;
  isRecurring?: boolean;
}

/**
 * Obtiene las tareas vencidas de la base de datos
 */
export async function getOverdueTasks(): Promise<OverdueTask[]> {
  try {
    const { getDatabase } = await import('../database/connection');
    const db = getDatabase();
    
    const now = new Date();
    
    const tasks = await db.task.findMany({
      where: {
        dueDate: {
          lt: now,
        },
        completedAt: null,
        deletedAt: null,
      },
      include: {
        project: true,
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    return tasks.map(t => {
      // Parse tags JSON
      let tags: string[] = [];
      try {
        if (t.tags) {
          tags = JSON.parse(t.tags);
        }
      } catch {}
      
      // Parse subtasks JSON
      let subtasks: { id: string; title: string; completed: boolean }[] = [];
      try {
        if (t.subtasks) {
          subtasks = JSON.parse(t.subtasks);
        }
      } catch {}
      
      return {
        id: t.id,
        title: t.title,
        notes: t.notes,
        dueDate: t.dueDate!,
        priority: t.priority,
        projectName: t.project?.name || null,
        tags,
        subtasksTotal: subtasks.length,
        subtasksDone: subtasks.filter(s => s.completed).length,
        isRecurring: !!t.recurrenceRule,
      };
    });
  } catch (error) {
    logger.error('Error getting overdue tasks:', error);
    return [];
  }
}

/**
 * Muestra el popup de tareas vencidas
 */
export async function showOverduePopup(): Promise<void> {
  const tasks = await getOverdueTasks();
  
  if (tasks.length === 0) {
    logger.info('No overdue tasks to show');
    return;
  }

  logger.info(`Showing ${tasks.length} overdue tasks`);

  if (overdueWindow && !overdueWindow.isDestroyed()) {
    overdueWindow.focus();
    return;
  }

  createOverdueWindow(tasks);
}

function createOverdueWindow(tasks: OverdueTask[]): void {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  const popupWidth = 620;
  const popupHeight = Math.min(800, 350 + Math.min(tasks.length, 8) * 95);

  overdueWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: Math.round((screenWidth - popupWidth) / 2),
    y: Math.round((screenHeight - popupHeight) / 2) - 50,
    frame: false,
    transparent: true,
    alwaysOnTop: false, // Permitir que otros windows estén encima
    skipTaskbar: false, // Mostrar en dock para poder restaurar
    resizable: false,
    minimizable: true,
    maximizable: false,
    closable: true,
    show: false,
    hasShadow: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDark = nativeTheme.shouldUseDarkColors;
  const htmlContent = generateOverdueHtml(tasks, isDark);
  overdueWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  overdueWindow.once('ready-to-show', () => {
    if (overdueWindow) {
      overdueWindow.show();
      overdueWindow.focus();
    }
  });

  overdueWindow.on('closed', () => {
    overdueWindow = null;
  });
}

export function closeOverduePopup(): void {
  if (overdueWindow && !overdueWindow.isDestroyed()) {
    overdueWindow.close();
  }
}

export function minimizeOverduePopup(): void {
  if (overdueWindow && !overdueWindow.isDestroyed()) {
    overdueWindow.minimize();
    logger.debug('Overdue popup minimized');
  }
}

export function restoreOverduePopup(): void {
  if (overdueWindow && !overdueWindow.isDestroyed()) {
    overdueWindow.restore();
    overdueWindow.focus();
    logger.debug('Overdue popup restored');
  }
}

export function isOverduePopupOpen(): boolean {
  return overdueWindow !== null && !overdueWindow.isDestroyed();
}

/**
 * Genera el HTML del popup con el tema actual
 */
function generateOverduePopupHtml(tasks: OverdueTask[]): string {
  const isDark = nativeTheme.shouldUseDarkColors;
  return generateOverdueHtml(tasks, isDark);
}

/**
 * Refresca el popup con las tareas vencidas actualizadas
 * Si ya no hay tareas vencidas, cierra el popup
 */
export async function refreshOverduePopup(): Promise<void> {
  if (!overdueWindow || overdueWindow.isDestroyed()) {
    return;
  }

  const tasks = await getOverdueTasks();
  
  if (tasks.length === 0) {
    // No quedan tareas vencidas - cerrar popup
    logger.info('No more overdue tasks, closing popup');
    closeOverduePopup();
    return;
  }

  // Regenerar el HTML con las tareas actualizadas
  const html = generateOverduePopupHtml(tasks);
  overdueWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  // Restaurar si estaba minimizado
  if (overdueWindow.isMinimized()) {
    overdueWindow.restore();
  }
  overdueWindow.focus();
  
  logger.debug(`Refreshed overdue popup with ${tasks.length} tasks`);
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function formatOverdueTime(dueDate: Date | string): string {
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  } else if (diffMins > 0) {
    return `Hace ${diffMins} min`;
  }
  return 'Justo ahora';
}

function generateOverdueHtml(tasks: OverdueTask[], isDark: boolean): string {
  const theme = isDark ? {
    bg: 'rgba(30, 30, 30, 0.95)',
    cardBg: 'rgba(45, 45, 45, 0.9)',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: 'rgba(255, 255, 255, 0.1)',
    buttonBg: 'rgba(255, 255, 255, 0.08)',
    buttonHover: 'rgba(255, 255, 255, 0.15)',
  } : {
    bg: 'rgba(255, 255, 255, 0.95)',
    cardBg: 'rgba(250, 250, 250, 0.9)',
    text: '#18181B',
    textSecondary: '#52525B',
    textMuted: '#A1A1AA',
    border: 'rgba(0, 0, 0, 0.08)',
    buttonBg: 'rgba(0, 0, 0, 0.04)',
    buttonHover: 'rgba(0, 0, 0, 0.08)',
  };

  const priorityColors: Record<number, string> = {
    1: '#EF4444',
    2: '#F59E0B',
    3: '#3B82F6',
  };

  const taskIds = tasks.map(t => t.id);

  const taskItems = tasks.map(task => {
    const color = priorityColors[task.priority] || priorityColors[3];
    const overdueText = formatOverdueTime(task.dueDate);
    const notes = task.notes ? escapeHtml(task.notes).substring(0, 80) + (task.notes.length > 80 ? '...' : '') : '';
    const tagsHtml = task.tags && task.tags.length > 0 
      ? task.tags.slice(0, 3).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('') 
      : '';
    
    return `
      <div class="task-item" data-id="${task.id}">
        <div class="task-priority" style="background: ${color}"></div>
        <div class="task-content">
          <div class="task-header">
            <span class="task-title">${escapeHtml(task.title)}${task.isRecurring ? ' 🔄' : ''}</span>
            <span class="overdue-badge">⏰ ${overdueText}</span>
          </div>
          <div class="task-details">
            ${task.projectName ? `<span class="detail-item">📁 ${escapeHtml(task.projectName)}</span>` : ''}
            ${task.subtasksTotal && task.subtasksTotal > 0 ? `<span class="detail-item">☑️ ${task.subtasksDone}/${task.subtasksTotal}</span>` : ''}
            ${tagsHtml ? `<span class="tags-row">${tagsHtml}</span>` : ''}
          </div>
          ${notes ? `<div class="task-notes">${notes}</div>` : ''}
          
          <div class="snooze-row">
            <span class="snooze-label">Aplazar:</span>
            <button class="snooze-btn" onclick="snoozeTask('${task.id}', 5)">5m</button>
            <button class="snooze-btn" onclick="snoozeTask('${task.id}', 15)">15m</button>
            <button class="snooze-btn" onclick="snoozeTask('${task.id}', 60)">1h</button>
            <button class="snooze-btn" onclick="snoozeTask('${task.id}', 'tomorrow')">Mañana</button>
          </div>
        </div>
        <div class="task-actions">
          <button class="btn-complete" onclick="completeTask('${task.id}')" title="Completar">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
          <button class="btn-open" onclick="openTask('${task.id}')" title="Editar">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      background: transparent;
      -webkit-font-smoothing: antialiased;
      -webkit-user-select: none;
    }
    
    .container {
      background: ${theme.bg};
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px ${theme.border};
      overflow: hidden;
      animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    @keyframes slideIn {
      0% { opacity: 0; transform: translateY(-20px) scale(0.96); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    
    .header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid ${theme.border};
      display: flex;
      align-items: center;
      justify-content: space-between;
      -webkit-app-region: drag;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .warning-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #EF4444, #DC2626);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
    }
    
    .warning-icon svg {
      width: 26px;
      height: 26px;
      fill: white;
    }
    
    .header-text h1 {
      font-size: 18px;
      font-weight: 600;
      color: ${theme.text};
    }
    
    .header-text p {
      font-size: 13px;
      color: ${theme.textSecondary};
      margin-top: 2px;
    }
    
    .header-buttons {
      display: flex;
      gap: 6px;
      -webkit-app-region: no-drag;
    }
    
    .minimize-btn, .close-btn {
      width: 30px;
      height: 30px;
      border: none;
      background: ${theme.buttonBg};
      border-radius: 8px;
      color: ${theme.textMuted};
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-app-region: no-drag;
      transition: all 0.15s ease;
    }
    
    .minimize-btn:hover {
      background: #F59E0B;
      color: white;
    }
    
    .close-btn:hover {
      background: ${theme.buttonHover};
      color: ${theme.textSecondary};
    }
    
    .group-actions {
      padding: 12px 20px;
      border-bottom: 1px solid ${theme.border};
      display: flex;
      align-items: center;
      gap: 12px;
      background: ${theme.cardBg};
      -webkit-app-region: no-drag;
    }
    
    .group-label {
      font-size: 12px;
      font-weight: 600;
      color: ${theme.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .group-snooze-btns {
      display: flex;
      gap: 6px;
    }
    
    .group-btn {
      padding: 6px 12px;
      border: 1px solid ${theme.border};
      background: ${theme.buttonBg};
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      color: ${theme.textSecondary};
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .group-btn:hover {
      background: #F59E0B;
      border-color: #F59E0B;
      color: white;
    }
    
    .group-btn.complete-all {
      margin-left: auto;
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
      color: #10B981;
    }
    
    .group-btn.complete-all:hover {
      background: #10B981;
      color: white;
    }
    
    .tasks-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    
    .task-item {
      display: flex;
      gap: 12px;
      padding: 14px;
      background: ${theme.cardBg};
      border-radius: 12px;
      margin-bottom: 10px;
      border: 1px solid ${theme.border};
      transition: all 0.15s ease;
    }
    
    .task-item:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      border-color: ${theme.textMuted}40;
    }
    
    .task-priority {
      width: 4px;
      border-radius: 2px;
      flex-shrink: 0;
      align-self: stretch;
    }
    
    .task-content {
      flex: 1;
      min-width: 0;
    }
    
    .task-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    
    .task-title {
      font-size: 14px;
      font-weight: 600;
      color: ${theme.text};
      flex: 1;
    }
    
    .overdue-badge {
      font-size: 11px;
      color: #EF4444;
      font-weight: 600;
      white-space: nowrap;
      padding: 2px 8px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 10px;
    }
    
    .task-details {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 12px;
      color: ${theme.textMuted};
      margin-bottom: 4px;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .tags-row {
      display: flex;
      gap: 4px;
    }
    
    .tag {
      font-size: 10px;
      padding: 2px 6px;
      background: ${theme.buttonBg};
      border-radius: 8px;
      color: ${theme.textSecondary};
    }
    
    .task-notes {
      font-size: 12px;
      color: ${theme.textMuted};
      line-height: 1.4;
      padding: 6px 8px;
      background: ${theme.buttonBg};
      border-radius: 6px;
      margin: 6px 0;
      border-left: 2px solid ${theme.textMuted}40;
    }
    
    .snooze-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
    
    .snooze-label {
      font-size: 11px;
      color: ${theme.textMuted};
      font-weight: 500;
    }
    
    .snooze-btn {
      padding: 4px 10px;
      border: 1px solid ${theme.border};
      background: ${theme.buttonBg};
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      color: ${theme.textSecondary};
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .snooze-btn:hover {
      background: #F59E0B;
      border-color: #F59E0B;
      color: white;
    }
    
    .task-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    
    .task-actions button {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    
    .task-actions button svg {
      width: 20px;
      height: 20px;
    }
    
    .btn-complete {
      background: rgba(16, 185, 129, 0.15);
    }
    .btn-complete svg { fill: #10B981; }
    .btn-complete:hover {
      background: #10B981;
      transform: scale(1.05);
    }
    .btn-complete:hover svg { fill: white; }
    
    .btn-open {
      background: ${theme.buttonBg};
    }
    .btn-open svg { fill: ${theme.textMuted}; }
    .btn-open:hover {
      background: #3B82F6;
      transform: scale(1.05);
    }
    .btn-open:hover svg { fill: white; }
    
    .footer {
      padding: 14px 20px;
      border-top: 1px solid ${theme.border};
      display: flex;
      gap: 10px;
      -webkit-app-region: no-drag;
    }
    
    .footer-btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .btn-dismiss-all {
      background: ${theme.buttonBg};
      color: ${theme.textSecondary};
      border: 1px solid ${theme.border};
    }
    .btn-dismiss-all:hover {
      background: ${theme.buttonHover};
    }
    
    .btn-open-app {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
    }
    .btn-open-app:hover {
      box-shadow: 0 6px 16px rgba(59, 130, 246, 0.45);
      transform: translateY(-1px);
    }
    
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }
    
    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
      animation: bounce 0.6s ease;
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    
    .empty-state p {
      font-size: 16px;
      color: ${theme.textSecondary};
      font-weight: 500;
    }
    
    .tasks-list::-webkit-scrollbar {
      width: 8px;
    }
    
    .tasks-list::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .tasks-list::-webkit-scrollbar-thumb {
      background: ${theme.border};
      border-radius: 4px;
    }
    
    .tasks-list::-webkit-scrollbar-thumb:hover {
      background: ${theme.textMuted};
    }
    
    /* ═══════════════════════════════════════════════════════════════ */
    /* EDIT MODAL OVERLAY */
    /* ═══════════════════════════════════════════════════════════════ */
    
    .edit-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }
    
    .edit-overlay.visible {
      display: flex;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .edit-modal {
      background: ${theme.bg};
      border-radius: 16px;
      width: 90%;
      max-width: 400px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
      border: 1px solid ${theme.border};
      animation: modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    
    @keyframes modalSlideIn {
      from { opacity: 0; transform: scale(0.9) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    
    .edit-header {
      padding: 16px 20px;
      border-bottom: 1px solid ${theme.border};
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    
    .edit-header h2 {
      font-size: 16px;
      font-weight: 600;
      color: ${theme.text};
    }
    
    .edit-close {
      width: 28px;
      height: 28px;
      border: none;
      background: ${theme.buttonBg};
      border-radius: 6px;
      color: ${theme.textMuted};
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .edit-close:hover {
      background: ${theme.buttonHover};
    }
    
    .edit-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }
    
    .edit-task-title {
      font-size: 15px;
      font-weight: 600;
      color: ${theme.text};
      margin-bottom: 16px;
      padding: 12px;
      background: ${theme.cardBg};
      border-radius: 8px;
      border: 1px solid ${theme.border};
    }
    
    .edit-row {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .edit-field {
      flex: 1;
    }
    
    .edit-field label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: ${theme.textMuted};
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .edit-field input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid ${theme.border};
      border-radius: 8px;
      background: ${theme.cardBg};
      color: ${theme.text};
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
    }
    
    .edit-field input:focus {
      border-color: #3B82F6;
    }
    
    .edit-field input[type="date"],
    .edit-field input[type="time"] {
      cursor: pointer;
    }
    
    .edit-footer {
      padding: 16px 20px;
      border-top: 1px solid ${theme.border};
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-shrink: 0;
    }
    
    .edit-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .edit-btn-cancel {
      background: ${theme.buttonBg};
      color: ${theme.textSecondary};
      border: 1px solid ${theme.border};
    }
    
    .edit-btn-cancel:hover {
      background: ${theme.buttonHover};
    }
    
    .edit-btn-save {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }
    
    .edit-btn-save:hover {
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      transform: translateY(-1px);
    }

    .edit-btn-save.has-conflict {
      background: linear-gradient(135deg, #F59E0B, #D97706);
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
    }

    .edit-btn-save.has-conflict:hover {
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
    
    /* Conflict Warning Styles */
    .conflict-warning {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 10px;
      margin-top: 16px;
      animation: fadeIn 0.3s ease;
    }
    
    .conflict-icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    
    .conflict-text {
      flex: 1;
    }
    
    .conflict-text strong {
      display: block;
      color: #EF4444;
      font-size: 13px;
      margin-bottom: 4px;
    }
    
    .conflict-text p {
      color: ${theme.textSecondary};
      font-size: 12px;
      margin: 0;
      line-height: 1.4;
    }
    
    .dayload-warning {
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      margin-top: 12px;
      animation: fadeIn 0.3s ease;
    }
    
    .dayload-icon {
      font-size: 16px;
    }
    
    .dayload-text {
      color: ${theme.textSecondary};
      font-size: 12px;
      line-height: 1.4;
    }
    
    .suggestions-container {
      margin-top: 12px;
      padding: 12px;
      background: ${theme.cardBg};
      border: 1px solid ${theme.border};
      border-radius: 10px;
      animation: fadeIn 0.3s ease;
    }
    
    .suggestions-title {
      font-size: 12px;
      font-weight: 600;
      color: ${theme.textMuted};
      margin-bottom: 10px;
    }
    
    .suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .suggestion-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: ${theme.bg};
      border: 1px solid ${theme.border};
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .suggestion-item:hover {
      border-color: #3B82F6;
      background: rgba(59, 130, 246, 0.05);
    }
    
    .suggestion-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .suggestion-date {
      font-size: 12px;
      font-weight: 600;
      color: ${theme.text};
    }
    
    .suggestion-reason {
      font-size: 11px;
      color: ${theme.textMuted};
    }
    
    .suggestion-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .suggestion-badge.light {
      background: rgba(34, 197, 94, 0.15);
      color: #22C55E;
    }
    
    .suggestion-badge.moderate {
      background: rgba(245, 158, 11, 0.15);
      color: #F59E0B;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* Slide-left animation for removed tasks */
    .task-item.slide-out {
      animation: slideOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    
    @keyframes slideOut {
      0% { 
        opacity: 1; 
        transform: translateX(0); 
      }
      100% { 
        opacity: 0; 
        transform: translateX(-100%);
        height: 0;
        padding: 0;
        margin: 0;
        border: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="warning-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        </div>
        <div class="header-text">
          <h1>Tareas vencidas</h1>
          <p class="task-count">${tasks.length} tarea${tasks.length > 1 ? 's' : ''} pendiente${tasks.length > 1 ? 's' : ''}</p>
        </div>
      </div>
      <div class="header-buttons">
        <button class="minimize-btn" onclick="minimizePopup()" title="Minimizar">−</button>
        <button class="close-btn" onclick="closePopup()" title="Cerrar">×</button>
      </div>
    </div>
    
    <div class="group-actions">
      <span class="group-label">Aplazar todas:</span>
      <div class="group-snooze-btns">
        <button class="group-btn" onclick="snoozeAll(5)">5 min</button>
        <button class="group-btn" onclick="snoozeAll(15)">15 min</button>
        <button class="group-btn" onclick="snoozeAll(60)">1 hora</button>
        <button class="group-btn" onclick="snoozeAll('tomorrow')">Mañana</button>
      </div>
      <button class="group-btn complete-all" onclick="completeAll()">✓ Completar todas</button>
    </div>
    
    <div class="tasks-list">
      ${taskItems}
    </div>
    
    <div class="footer">
      <button class="footer-btn btn-dismiss-all" onclick="closePopup()">Cerrar</button>
      <button class="footer-btn btn-open-app" onclick="openApp()">Abrir AgendaPro</button>
    </div>
  </div>
  
  <!-- Edit Modal Overlay -->
  <div class="edit-overlay" id="editOverlay">
    <div class="edit-modal">
      <div class="edit-header">
        <h2>📝 Editar tarea</h2>
        <button class="edit-close" onclick="closeEditModal()">×</button>
      </div>
      <div class="edit-body">
        <div class="edit-task-title" id="editTaskTitle"></div>
        <div class="edit-row">
          <div class="edit-field">
            <label>📅 Fecha</label>
            <input type="date" id="editDate">
          </div>
          <div class="edit-field">
            <label>🕐 Hora</label>
            <input type="time" id="editTime">
          </div>
        </div>
        <!-- Conflict Warning -->
        <div class="conflict-warning" id="conflictWarning" style="display: none;">
          <div class="conflict-icon">⚠️</div>
          <div class="conflict-text">
            <strong>Conflicto de horario detectado</strong>
            <p id="conflictMessage"></p>
          </div>
        </div>
        <!-- Day Load Warning -->
        <div class="dayload-warning" id="dayLoadWarning" style="display: none;">
          <div class="dayload-icon">📊</div>
          <div class="dayload-text" id="dayLoadMessage"></div>
        </div>
        <!-- Suggestions -->
        <div class="suggestions-container" id="suggestionsContainer" style="display: none;">
          <div class="suggestions-title">💡 Sugerencias alternativas:</div>
          <div class="suggestions-list" id="suggestionsList"></div>
        </div>
      </div>
      <div class="edit-footer">
        <button class="edit-btn edit-btn-cancel" onclick="closeEditModal()">Cancelar</button>
        <button class="edit-btn edit-btn-save" id="saveBtn" onclick="saveTask()">Guardar</button>
      </div>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    const allTaskIds = ${JSON.stringify(taskIds)};
    let currentEditingTaskId = null;
    
    // Task data cache
    const tasksData = ${JSON.stringify(tasks.map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate
    })))};
    
    function completeTask(taskId) {
      ipcRenderer.send('overdue:complete', taskId);
      slideOutTask(taskId);
    }
    
    function snoozeTask(taskId, minutes) {
      ipcRenderer.send('overdue:snooze', { taskId, minutes });
      slideOutTask(taskId);
    }
    
    function openTask(taskId) {
      // Find task data
      const task = tasksData.find(t => t.id === taskId);
      if (!task) return;
      
      currentEditingTaskId = taskId;
      
      // Reset conflict UI
      resetConflictUI();
      
      // Populate modal
      document.getElementById('editTaskTitle').textContent = task.title;
      
      // Set date and time
      const dueDate = task.dueDate ? new Date(task.dueDate) : new Date();
      // Default to tomorrow if editing
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const dateToUse = dueDate < new Date() ? tomorrow : dueDate;
      
      document.getElementById('editDate').value = dateToUse.toISOString().split('T')[0];
      document.getElementById('editTime').value = dateToUse.toTimeString().slice(0, 5);
      
      // Check conflicts for initial date
      checkScheduleConflicts();
      
      // Show modal
      document.getElementById('editOverlay').classList.add('visible');
    }
    
    function resetConflictUI() {
      document.getElementById('conflictWarning').style.display = 'none';
      document.getElementById('dayLoadWarning').style.display = 'none';
      document.getElementById('suggestionsContainer').style.display = 'none';
      document.getElementById('saveBtn').classList.remove('has-conflict');
      document.getElementById('saveBtn').textContent = 'Guardar';
    }
    
    let checkTimeout = null;
    async function checkScheduleConflicts() {
      const dateValue = document.getElementById('editDate').value;
      const timeValue = document.getElementById('editTime').value;
      
      if (!dateValue) return;
      
      const proposedDate = new Date(dateValue + 'T' + (timeValue || '09:00') + ':00');
      
      // Clear previous timeout to debounce
      if (checkTimeout) clearTimeout(checkTimeout);
      
      checkTimeout = setTimeout(async () => {
        try {
          const analysis = await ipcRenderer.invoke('schedule:analyze', proposedDate.toISOString(), currentEditingTaskId);
          
          // Reset UI first
          resetConflictUI();
          
          const saveBtn = document.getElementById('saveBtn');
          
          // Show conflict warning if exists
          if (analysis.conflicts && analysis.conflicts.hasConflicts) {
            const conflictNames = analysis.conflicts.conflicts.map(c => c.title).join(', ');
            document.getElementById('conflictMessage').textContent = 
              'Ya tienes programado: ' + conflictNames + ' a una hora similar.';
            document.getElementById('conflictWarning').style.display = 'flex';
            saveBtn.classList.add('has-conflict');
            saveBtn.textContent = 'Guardar de todas formas';
          }
          
          // Show day load warning if heavy/moderate
          if (analysis.dayLoad && analysis.dayLoad.level !== 'light') {
            const levelText = analysis.dayLoad.level === 'heavy' ? 'muy cargado' : 'moderadamente ocupado';
            document.getElementById('dayLoadMessage').innerHTML = 
              '<strong>' + getDayName(proposedDate) + '</strong> está ' + levelText + 
              ' con <strong>' + analysis.dayLoad.taskCount + ' tareas</strong>.';
            document.getElementById('dayLoadWarning').style.display = 'flex';
          }
          
          // Show suggestions if available
          if (analysis.suggestions && analysis.suggestions.length > 0) {
            const suggestionsList = document.getElementById('suggestionsList');
            suggestionsList.innerHTML = '';
            
            analysis.suggestions.forEach(suggestion => {
              const suggDate = new Date(suggestion.date);
              const item = document.createElement('div');
              item.className = 'suggestion-item';
              item.onclick = () => applySuggestion(suggDate);
              item.innerHTML = \`
                <div class="suggestion-info">
                  <span class="suggestion-date">\${formatSuggestionDate(suggDate)}</span>
                  <span class="suggestion-reason">\${suggestion.reason}</span>
                </div>
                <span class="suggestion-badge \${suggestion.dayLoad}">\${suggestion.dayLoad === 'light' ? 'Libre' : 'Ocupado'}</span>
              \`;
              suggestionsList.appendChild(item);
            });
            
            document.getElementById('suggestionsContainer').style.display = 'block';
          }
        } catch (error) {
          console.error('Error checking schedule conflicts:', error);
        }
      }, 300);
    }
    
    function getDayName(date) {
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      return days[date.getDay()];
    }
    
    function formatSuggestionDate(date) {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      
      if (date.toDateString() === today.toDateString()) {
        return 'Hoy a las ' + timeStr;
      } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'Mañana a las ' + timeStr;
      } else {
        return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) + ' a las ' + timeStr;
      }
    }
    
    function applySuggestion(date) {
      document.getElementById('editDate').value = date.toISOString().split('T')[0];
      document.getElementById('editTime').value = date.toTimeString().slice(0, 5);
      checkScheduleConflicts();
    }
    
    // Add event listeners for date/time changes
    document.getElementById('editDate').addEventListener('change', checkScheduleConflicts);
    document.getElementById('editTime').addEventListener('change', checkScheduleConflicts);
    
    function closeEditModal() {
      document.getElementById('editOverlay').classList.remove('visible');
      currentEditingTaskId = null;
      resetConflictUI();
    }
    
    async function saveTask() {
      if (!currentEditingTaskId) return;
      
      const taskIdToUpdate = currentEditingTaskId; // Guardar antes de limpiar
      
      const dateValue = document.getElementById('editDate').value;
      const timeValue = document.getElementById('editTime').value;
      
      if (!dateValue) {
        alert('Por favor selecciona una fecha');
        return;
      }
      
      // Combine date and time
      const newDueDate = new Date(dateValue + 'T' + (timeValue || '09:00') + ':00');
      
      // Check if date is still in the past
      if (newDueDate < new Date()) {
        alert('La fecha debe ser en el futuro');
        return;
      }
      
      // Send update to main process
      ipcRenderer.send('overdue:updateTask', { 
        taskId: taskIdToUpdate, 
        dueDate: newDueDate.toISOString() 
      });
      
      // Close modal first
      document.getElementById('editOverlay').classList.remove('visible');
      currentEditingTaskId = null;
      
      // Then animate out the task
      slideOutTask(taskIdToUpdate);
    }
    
    function slideOutTask(taskId) {
      const item = document.querySelector(\`.task-item[data-id="\${taskId}"]\`);
      if (item) {
        item.classList.add('slide-out');
        setTimeout(() => {
          item.remove();
          updateTaskCount();
        }, 400);
      }
    }
    
    function updateTaskCount() {
      const remaining = document.querySelectorAll('.task-item');
      const countEl = document.querySelector('.task-count');
      
      if (remaining.length === 0) {
        countEl.textContent = '¡Todo completado!';
        document.querySelector('.tasks-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><p>¡Excelente! No tienes tareas vencidas.</p></div>';
        document.querySelector('.group-actions').style.display = 'none';
      } else {
        countEl.textContent = remaining.length + ' tarea' + (remaining.length > 1 ? 's' : '') + ' pendiente' + (remaining.length > 1 ? 's' : '');
      }
    }
    
    function minimizePopup() {
      ipcRenderer.send('overdue:minimize');
    }
    
    function openApp() {
      ipcRenderer.send('overdue:openApp');
      closePopup();
    }
    
    function closePopup() {
      ipcRenderer.send('overdue:close');
    }
    
    function snoozeAll(minutes) {
      const remaining = Array.from(document.querySelectorAll('.task-item')).map(el => el.dataset.id);
      ipcRenderer.send('overdue:snoozeAll', { taskIds: remaining, minutes });
      closePopup();
    }
    
    function completeAll() {
      const remaining = Array.from(document.querySelectorAll('.task-item')).map(el => el.dataset.id);
      ipcRenderer.send('overdue:completeAll', remaining);
      closePopup();
    }
    
    function removeTaskFromList(taskId) {
      slideOutTask(taskId);
    }
  </script>
</body>
</html>`;
}

function calculateSnoozeDate(minutes: number | 'tomorrow'): Date {
  if (minutes === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function snoozeTaskInDb(taskId: string, snoozedUntil: Date): Promise<void> {
  const { getDatabase } = await import('../database/connection');
  const db = getDatabase();
  
  await db.task.update({
    where: { id: taskId },
    data: { dueDate: snoozedUntil },
  });
  
  const reminder = await db.reminder.findFirst({
    where: { taskId },
  });
  
  if (reminder) {
    await db.reminder.update({
      where: { id: reminder.id },
      data: { fireAt: snoozedUntil },
    });
    
    await db.nextNotification.upsert({
      where: { reminderId: reminder.id },
      update: { nextFireAt: snoozedUntil },
      create: { reminderId: reminder.id, nextFireAt: snoozedUntil },
    });
  }
}

export function setupOverduePopupHandlers(): void {
  ipcMain.on('overdue:complete', async (_event, taskId: string) => {
    try {
      const { completeTask } = await import('../services/taskService');
      await completeTask(taskId);
      logger.info(`Overdue task completed: ${taskId}`);
      
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
    } catch (error) {
      logger.error('Error completing overdue task:', error);
    }
  });

  ipcMain.on('overdue:snooze', async (_event, data: { taskId: string; minutes: number | 'tomorrow' }) => {
    try {
      const snoozedUntil = calculateSnoozeDate(data.minutes);
      await snoozeTaskInDb(data.taskId, snoozedUntil);
      
      logger.info(`Overdue task snoozed: ${data.taskId} until ${snoozedUntil}`);
      
      const { reschedule } = await import('../scheduler/dueDateScheduler');
      reschedule();
      
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
    } catch (error) {
      logger.error('Error snoozing overdue task:', error);
    }
  });

  ipcMain.on('overdue:snoozeAll', async (_event, data: { taskIds: string[]; minutes: number | 'tomorrow' }) => {
    try {
      const snoozedUntil = calculateSnoozeDate(data.minutes);
      
      for (const taskId of data.taskIds) {
        await snoozeTaskInDb(taskId, snoozedUntil);
      }
      
      logger.info(`Snoozed ${data.taskIds.length} overdue tasks until ${snoozedUntil}`);
      
      const { reschedule } = await import('../scheduler/dueDateScheduler');
      reschedule();
      
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
    } catch (error) {
      logger.error('Error snoozing all overdue tasks:', error);
    }
  });

  ipcMain.on('overdue:completeAll', async (_event, taskIds: string[]) => {
    try {
      const { completeTask } = await import('../services/taskService');
      
      for (const taskId of taskIds) {
        await completeTask(taskId);
      }
      
      logger.info(`Completed ${taskIds.length} overdue tasks`);
      
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
    } catch (error) {
      logger.error('Error completing all overdue tasks:', error);
    }
  });

  ipcMain.on('overdue:open', async (_event, taskId: string) => {
    showMainWindow();
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:edit', taskId);
    }
  });

  ipcMain.on('overdue:openApp', () => {
    showMainWindow();
  });

  ipcMain.on('overdue:minimize', () => {
    minimizeOverduePopup();
  });

  ipcMain.on('overdue:updateTask', async (_event, data: { taskId: string; dueDate: string }) => {
    try {
      const { getDatabase } = await import('../database/connection');
      const db = getDatabase();
      
      const newDueDate = new Date(data.dueDate);
      
      // Update task
      await db.task.update({
        where: { id: data.taskId },
        data: { dueDate: newDueDate },
      });
      
      // Update reminder if exists
      const reminder = await db.reminder.findFirst({
        where: { taskId: data.taskId },
      });
      
      if (reminder) {
        await db.reminder.update({
          where: { id: reminder.id },
          data: { fireAt: newDueDate },
        });
        
        await db.nextNotification.upsert({
          where: { reminderId: reminder.id },
          update: { nextFireAt: newDueDate },
          create: { reminderId: reminder.id, nextFireAt: newDueDate },
        });
      }
      
      logger.info(`Overdue task updated: ${data.taskId} -> ${newDueDate}`);
      
      // Reschedule notifications
      const { reschedule } = await import('../scheduler/dueDateScheduler');
      reschedule();
      
      // Refresh main window
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
    } catch (error) {
      logger.error('Error updating overdue task:', error);
    }
  });

  ipcMain.on('overdue:close', () => {
    closeOverduePopup();
  });

  // Refrescar el popup después de editar una tarea
  ipcMain.on('overdue:refresh', async () => {
    await refreshOverduePopup();
  });

  logger.debug('Overdue popup handlers registered');
}
