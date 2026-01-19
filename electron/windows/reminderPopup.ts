/**
 * Reminder Popup Window - Professional Edition
 * Ventana emergente elegante para recordatorios
 * 
 * - Diseño glassmorphism moderno
 * - Barra de color indicadora de prioridad
 * - Iconos SVG profesionales
 * - Modo claro/oscuro automático
 * - Animaciones suaves
 */

import { BrowserWindow, screen, ipcMain, shell, nativeTheme } from 'electron';
import * as path from 'path';
import { snoozeReminder, dismissReminder } from '../services/reminderService';
import { completeTask } from '../services/taskService';
import { reschedule } from '../scheduler/dueDateScheduler';
import { logger } from '../utils/logger';
import { getMainWindow } from './mainWindow';

let reminderWindow: BrowserWindow | null = null;
let pendingReminders: ReminderPopupData[] = [];

export interface ReminderPopupData {
  taskId: string;
  reminderId: string;
  taskTitle: string;
  taskNotes?: string | null;
  dueDate: Date | string | null;
  priority?: number;
  projectName?: string | null;
  tags?: string[] | null;
  isRecurring?: boolean;
  subtasksCount?: number;
  subtasksDone?: number;
}

/**
 * Muestra el popup de recordatorio profesional
 */
export function showReminderPopup(data: ReminderPopupData): void {
  logger.info(`Showing reminder popup for: ${data.taskTitle}`);
  
  // Si ya hay uno abierto, agregar a la cola
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    pendingReminders.push(data);
    logger.debug(`Reminder queued, ${pendingReminders.length} pending`);
    return;
  }

  createReminderWindow(data);
}

function createReminderWindow(data: ReminderPopupData): void {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  const popupWidth = 420;
  const popupHeight = 380;

  reminderWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: Math.round((screenWidth - popupWidth) / 2),
    y: Math.round((screenHeight - popupHeight) / 2) - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: false, // NO mantener siempre encima - comportamiento normal de ventana
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
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
  const htmlContent = generateReminderHtml(data, isDark);
  reminderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  reminderWindow.once('ready-to-show', () => {
    if (reminderWindow) {
      // Mostrar y enfocar sin alwaysOnTop - comportamiento normal de ventana
      reminderWindow.show();
      reminderWindow.focus();
      shell.beep();
      // Elevar la ventana al frente una sola vez
      reminderWindow.moveTop();
      logger.debug('Reminder popup: shown with normal window behavior');
    }
  });
  
  reminderWindow.on('closed', () => {
    reminderWindow = null;
    if (pendingReminders.length > 0) {
      const next = pendingReminders.shift()!;
      setTimeout(() => createReminderWindow(next), 300);
    }
  });
}

/**
 * Cierra el popup de recordatorio
 */
export function closeReminderPopup(): void {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.close();
  }
}

/**
 * Genera el HTML del popup profesional con soporte dark/light mode
 */
function generateReminderHtml(data: ReminderPopupData, isDark: boolean): string {
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;
  const dueTime = dueDate 
    ? dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';
  const dueDay = dueDate
    ? dueDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  
  const notes = data.taskNotes 
    ? escapeHtml(data.taskNotes).substring(0, 120) + (data.taskNotes.length > 120 ? '...' : '')
    : '';

  // Info adicional
  const projectName = data.projectName || null;
  const tags = data.tags && data.tags.length > 0 ? data.tags : null;
  const isRecurring = data.isRecurring || false;
  const subtasksCount = data.subtasksCount || 0;
  const subtasksDone = data.subtasksDone || 0;

  // Colores de prioridad
  const priorityConfig: Record<number, { color: string; bg: string; label: string }> = {
    1: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Alta' },
    2: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)', label: 'Media' },
    3: { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)', label: 'Normal' },
  };
  const priority = priorityConfig[data.priority || 3] || priorityConfig[3];

  // Tema claro/oscuro
  const theme = isDark ? {
    bg: 'rgba(30, 30, 30, 0.92)',
    cardBg: 'rgba(45, 45, 45, 0.95)',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: 'rgba(255, 255, 255, 0.1)',
    buttonBg: 'rgba(255, 255, 255, 0.08)',
    buttonHover: 'rgba(255, 255, 255, 0.15)',
  } : {
    bg: 'rgba(255, 255, 255, 0.92)',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    text: '#18181B',
    textSecondary: '#52525B',
    textMuted: '#A1A1AA',
    border: 'rgba(0, 0, 0, 0.08)',
    buttonBg: 'rgba(0, 0, 0, 0.04)',
    buttonHover: 'rgba(0, 0, 0, 0.08)',
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
      background: transparent;
      -webkit-font-smoothing: antialiased;
      -webkit-user-select: none;
      user-select: none;
    }
    
    .container {
      background: ${theme.bg};
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      border-radius: 16px;
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        0 0 0 1px ${theme.border};
      overflow: hidden;
      animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: row;
      height: 100%;
    }
    
    @keyframes slideIn {
      0% {
        opacity: 0;
        transform: translateY(-20px) scale(0.96);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    /* Barra lateral de color */
    .priority-bar {
      width: 5px;
      background: linear-gradient(180deg, ${priority.color}, ${priority.color}dd);
      flex-shrink: 0;
    }
    
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px 24px;
    }
    
    /* Header */
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
      -webkit-app-region: drag;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .bell-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, ${priority.color}, ${priority.color}cc);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px ${priority.color}40;
    }
    
    .bell-icon svg {
      width: 22px;
      height: 22px;
      fill: white;
    }
    
    .header-text .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: ${priority.color};
      margin-bottom: 2px;
    }
    
    .header-text .time-label {
      font-size: 13px;
      color: ${theme.textSecondary};
    }
    
    .close-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: ${theme.buttonBg};
      border-radius: 8px;
      color: ${theme.textMuted};
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-app-region: no-drag;
      transition: all 0.15s ease;
    }
    
    .close-btn:hover {
      background: ${theme.buttonHover};
      color: ${theme.textSecondary};
    }
    
    /* Task Info */
    .task-info {
      flex: 1;
      margin-bottom: 16px;
    }
    
    .task-title {
      font-size: 20px;
      font-weight: 600;
      color: ${theme.text};
      line-height: 1.3;
      margin-bottom: 8px;
    }
    
    .task-due {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: ${theme.textSecondary};
    }
    
    .task-due svg {
      width: 16px;
      height: 16px;
      fill: ${theme.textMuted};
    }
    
    .task-due .highlight {
      color: ${priority.color};
      font-weight: 600;
    }
    
    .task-meta {
      margin-top: 6px;
      font-size: 12px;
      color: ${theme.textSecondary};
    }
    
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    
    .task-tags {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .tag {
      font-size: 11px;
      padding: 3px 8px;
      background: ${theme.buttonBg};
      border-radius: 12px;
      color: ${theme.textSecondary};
      border: 1px solid ${theme.border};
    }
    
    .task-notes {
      margin-top: 8px;
      font-size: 13px;
      color: ${theme.textMuted};
      line-height: 1.4;
      padding: 8px 10px;
      background: ${theme.buttonBg};
      border-radius: 8px;
      border-left: 3px solid ${priority.color};
    }

    /* Snooze Section */
    .snooze-section {
      margin-bottom: 16px;
      -webkit-app-region: no-drag;
    }
    
    .snooze-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: ${theme.textMuted};
      margin-bottom: 10px;
    }
    
    .snooze-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    
    .snooze-btn {
      padding: 10px 8px;
      border: 1px solid ${theme.border};
      background: ${theme.buttonBg};
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      color: ${theme.textSecondary};
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    
    .snooze-btn svg {
      width: 18px;
      height: 18px;
      fill: ${theme.textMuted};
      transition: fill 0.15s ease;
    }
    
    .snooze-btn:hover {
      background: ${priority.bg};
      border-color: ${priority.color}40;
      color: ${priority.color};
    }
    
    .snooze-btn:hover svg {
      fill: ${priority.color};
    }
    
    .snooze-btn:active {
      transform: scale(0.97);
    }
    
    /* Action Buttons */
    .actions {
      display: flex;
      gap: 10px;
      -webkit-app-region: no-drag;
    }
    
    .btn {
      flex: 1;
      padding: 14px 16px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .btn svg {
      width: 18px;
      height: 18px;
    }
    
    .btn:active {
      transform: scale(0.98);
    }
    
    .btn-complete {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      color: white;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    
    .btn-complete svg {
      fill: white;
    }
    
    .btn-complete:hover {
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
      transform: translateY(-1px);
    }
    
    .btn-dismiss {
      background: ${theme.buttonBg};
      color: ${theme.textSecondary};
      border: 1px solid ${theme.border};
    }
    
    .btn-dismiss svg {
      fill: ${theme.textMuted};
    }
    
    .btn-dismiss:hover {
      background: ${theme.buttonHover};
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="priority-bar"></div>
    <div class="content">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <div class="bell-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
          </div>
          <div class="header-text">
            <div class="label">Recordatorio</div>
            <div class="time-label">${dueTime ? `Programado para ${dueTime}` : 'Ahora'}</div>
          </div>
        </div>
        <button class="close-btn" onclick="dismiss()" title="Cerrar">×</button>
      </div>
      
      <!-- Task Info -->
      <div class="task-info">
        <div class="task-title">${escapeHtml(data.taskTitle)}${isRecurring ? ' 🔄' : ''}</div>
        ${dueDay ? `
        <div class="task-due">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>
          <span>${dueDay}</span>
          ${dueTime ? `<span class="highlight">${dueTime}</span>` : ''}
        </div>
        ` : ''}
        ${projectName ? `
        <div class="task-meta">
          <span class="meta-item">📁 ${escapeHtml(projectName)}</span>
        </div>
        ` : ''}
        ${subtasksCount > 0 ? `
        <div class="task-meta">
          <span class="meta-item">☑️ Subtareas: ${subtasksDone}/${subtasksCount}</span>
        </div>
        ` : ''}
        ${tags ? `
        <div class="task-tags">
          ${tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ')}
        </div>
        ` : ''}
        ${notes ? `<div class="task-notes">${notes}</div>` : ''}
      </div>
      
      <!-- Snooze Options -->
      <div class="snooze-section">
        <div class="snooze-label">Posponer</div>
        <div class="snooze-grid">
          <button class="snooze-btn" onclick="snooze(5)">
            <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            5 min
          </button>
          <button class="snooze-btn" onclick="snooze(15)">
            <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            15 min
          </button>
          <button class="snooze-btn" onclick="snooze(60)">
            <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            1 hora
          </button>
          <button class="snooze-btn" onclick="snoozeTomorrow()">
            <svg viewBox="0 0 24 24"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>
            Mañana
          </button>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="actions">
        <button class="btn btn-complete" onclick="complete()">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          Completar
        </button>
        <button class="btn btn-dismiss" onclick="dismiss()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          Descartar
        </button>
      </div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    const taskId = '${data.taskId}';
    const reminderId = '${data.reminderId}';
    
    function complete() {
      ipcRenderer.invoke('reminder:action', 'complete', taskId, reminderId);
    }
    
    function snooze(minutes) {
      ipcRenderer.invoke('reminder:action', 'snooze', taskId, reminderId, minutes);
    }
    
    function snoozeTomorrow() {
      ipcRenderer.invoke('reminder:action', 'snoozeTomorrow', taskId, reminderId);
    }
    
    function dismiss() {
      ipcRenderer.invoke('reminder:action', 'dismiss', taskId, reminderId);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════════════════════
// IPC Handlers para acciones del popup
// ═══════════════════════════════════════════════════════════════════════════

export function setupReminderPopupHandlers(): void {
  ipcMain.handle('reminder:action', async (_event, action: string, taskId: string, reminderId: string, minutes?: number) => {
    logger.info(`Reminder action: ${action}, task: ${taskId}, reminder: ${reminderId}, minutes: ${minutes}`);
    
    try {
      switch (action) {
        case 'complete':
          await completeTask(taskId);
          await dismissReminder(reminderId);
          break;
          
        case 'snooze':
          await snoozeReminder(reminderId, { type: 'minutes', value: minutes || 10 });
          break;
          
        case 'snoozeTomorrow':
          await snoozeReminder(reminderId, { type: 'tomorrow', time: '09:00' });
          break;
          
        case 'dismiss':
          await dismissReminder(reminderId);
          break;
      }
      
      // Reprogramar el scheduler
      reschedule();
      
      // Notificar a la ventana principal para refrescar la lista
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:refresh');
      }
      
      // Cerrar el popup
      closeReminderPopup();
      
      return { success: true };
    } catch (error) {
      logger.error('Reminder action error:', error);
      return { success: false, error: String(error) };
    }
  });
}
