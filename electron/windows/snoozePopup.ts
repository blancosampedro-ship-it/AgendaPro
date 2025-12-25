/**
 * Snooze Popup Window
 * Ventana emergente para opciones de snooze
 * 
 * En Windows, los action buttons de las notificaciones no funcionan bien,
 * así que mostramos una ventana popup cuando se hace click en la notificación.
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';
import { snoozeReminder, dismissReminder } from '../services/reminderService';
import { completeTask } from '../services/taskService';
import { reschedule } from '../scheduler/dueDateScheduler';
import { logger } from '../utils/logger';

let snoozeWindow: BrowserWindow | null = null;

interface SnoozePopupData {
  taskId: string;
  reminderId: string;
  taskTitle: string;
  dueDate: string | null;
}

/**
 * Muestra el popup de snooze
 */
export function showSnoozePopup(data: SnoozePopupData): void {
  if (snoozeWindow) {
    snoozeWindow.close();
  }

  // Obtener posición: esquina inferior derecha
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  const popupWidth = 320;
  const popupHeight = 280;
  const margin = 20;

  snoozeWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: screenWidth - popupWidth - margin,
    y: screenHeight - popupHeight - margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  });

  // Generar HTML inline
  const htmlContent = generatePopupHtml(data);
  snoozeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  snoozeWindow.once('ready-to-show', () => {
    snoozeWindow?.show();
    snoozeWindow?.focus();
  });

  // Cerrar al perder foco
  snoozeWindow.on('blur', () => {
    setTimeout(() => {
      if (snoozeWindow && !snoozeWindow.isFocused()) {
        snoozeWindow.close();
      }
    }, 200);
  });

  snoozeWindow.on('closed', () => {
    snoozeWindow = null;
  });
}

/**
 * Cierra el popup de snooze
 */
export function closeSnoozePopup(): void {
  if (snoozeWindow) {
    snoozeWindow.close();
    snoozeWindow = null;
  }
}

/**
 * Genera el HTML del popup
 */
function generatePopupHtml(data: SnoozePopupData): string {
  const dueTime = data.dueDate 
    ? new Date(data.dueDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      -webkit-app-region: drag;
    }
    .popup {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      padding: 16px;
      color: white;
    }
    .header h2 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header .due {
      font-size: 12px;
      opacity: 0.9;
    }
    .actions {
      padding: 12px;
      -webkit-app-region: no-drag;
    }
    .btn {
      width: 100%;
      padding: 10px 16px;
      margin-bottom: 8px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .btn:last-child { margin-bottom: 0; }
    .btn:hover { transform: scale(1.02); }
    .btn:active { transform: scale(0.98); }
    .btn-complete {
      background: #10B981;
      color: white;
    }
    .btn-snooze {
      background: #F3F4F6;
      color: #374151;
    }
    .btn-snooze:hover {
      background: #E5E7EB;
    }
    .btn-dismiss {
      background: transparent;
      color: #9CA3AF;
      font-size: 12px;
    }
    .btn-dismiss:hover {
      color: #6B7280;
    }
    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      border: none;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      color: white;
      cursor: pointer;
      font-size: 14px;
      -webkit-app-region: no-drag;
    }
    .close-btn:hover {
      background: rgba(255,255,255,0.3);
    }
  </style>
</head>
<body>
  <div class="popup">
    <div class="header" style="position: relative;">
      <button class="close-btn" onclick="closePopup()">×</button>
      <h2>📋 ${escapeHtml(data.taskTitle)}</h2>
      ${dueTime ? `<div class="due">Vence: ${dueTime}</div>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-complete" onclick="complete()">
        ✓ Completar tarea
      </button>
      <button class="btn btn-snooze" onclick="snooze(10)">
        ⏰ Posponer 10 minutos
      </button>
      <button class="btn btn-snooze" onclick="snooze(60)">
        ⏰ Posponer 1 hora
      </button>
      <button class="btn btn-snooze" onclick="snoozeTomorrow()">
        🌅 Mañana a las 9:00
      </button>
      <button class="btn btn-dismiss" onclick="dismiss()">
        Descartar recordatorio
      </button>
    </div>
  </div>
  <script>
    const taskId = '${data.taskId}';
    const reminderId = '${data.reminderId}';
    
    function complete() {
      window.electronAPI?.snoozeAction?.('complete', taskId, reminderId);
      window.close();
    }
    
    function snooze(minutes) {
      window.electronAPI?.snoozeAction?.('snooze', taskId, reminderId, minutes);
      window.close();
    }
    
    function snoozeTomorrow() {
      window.electronAPI?.snoozeAction?.('snoozeTomorrow', taskId, reminderId);
      window.close();
    }
    
    function dismiss() {
      window.electronAPI?.snoozeAction?.('dismiss', taskId, reminderId);
      window.close();
    }
    
    function closePopup() {
      window.close();
    }
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });
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

export function setupSnoozePopupHandlers(): void {
  ipcMain.handle('snooze:action', async (_event, action, taskId, reminderId, minutes?) => {
    logger.debug(`Snooze action: ${action}, task: ${taskId}, reminder: ${reminderId}`);
    
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
          await snoozeReminder(reminderId, { type: 'tomorrow' });
          break;
          
        case 'dismiss':
          await dismissReminder(reminderId);
          break;
      }
      
      reschedule();
      closeSnoozePopup();
      return { success: true };
    } catch (error) {
      logger.error('Snooze action error:', error);
      return { success: false, error };
    }
  });
}
